(function (global) {
  'use strict';

  if (global.TgbMcAdminAuth) return;

  var DEFAULT_STORAGE_KEY = 'tgb-photo-review-auth-session';
  var STYLE_ID = 'mc-admin-auth-style';
  var ROOT_ID = 'mcAdminAuthRoot';
  var REMEMBER_SUFFIX = ':remember';
  var REMEMBERED_EMAIL_SUFFIX = ':email';

  function hasConfig(config) {
    return !!(config && config.url && config.publishableKey);
  }

  function isMissionControlPath() {
    try {
      var path = String(global.location.pathname || '').toLowerCase();
      return path === '/mc' || path.indexOf('/mc/') === 0;
    } catch (error) {
      return false;
    }
  }

  function ensureStyle(document) {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.mc-auth-modal{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px);}',
      '.mc-auth-modal.is-open{display:flex;}',
      '.mc-auth-panel{width:min(100%,460px);display:grid;gap:16px;padding:28px 26px 24px;border:1px solid rgba(45,72,128,.18);border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.97) 0%,rgba(245,247,251,.94) 100%);box-shadow:0 26px 64px rgba(15,23,42,.28);color:#1f2937;position:relative;}',
      '.mc-auth-close{position:absolute;top:14px;right:14px;width:38px;height:38px;border:1px solid rgba(45,72,128,.18);border-radius:10px;background:rgba(255,255,255,.84);color:#2d4880;font-size:1.1rem;font-weight:800;cursor:pointer;}',
      '.mc-auth-close:hover{background:#fff;}',
      '.mc-auth-kicker{margin:0;color:rgba(45,72,128,.74);font-size:.78rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;}',
      '.mc-auth-title{margin:0;color:#2d4880;font-size:clamp(2rem,4vw,3rem);line-height:.95;}',
      '.mc-auth-copy{margin:0;color:#5c6472;line-height:1.6;}',
      '.mc-auth-form{display:grid;gap:14px;}',
      '.mc-auth-form[hidden]{display:none;}',
      '.mc-auth-field{display:grid;gap:6px;font-size:.9rem;font-weight:700;color:#2d4880;}',
      '.mc-auth-field input{height:46px;padding:0 12px;border:1px solid rgba(45,72,128,.18);border-radius:10px;background:rgba(255,255,255,.92);color:#1f2937;font:inherit;}',
      '.mc-auth-field input:focus{outline:2px solid rgba(45,72,128,.24);outline-offset:2px;}',
      '.mc-auth-check{display:inline-flex;align-items:center;gap:8px;margin-top:-2px;color:#2d4880;font-size:.86rem;font-weight:800;line-height:1.3;}',
      '.mc-auth-check input{width:16px;height:16px;margin:0;accent-color:#2d4880;}',
      '.mc-auth-actions{display:flex;gap:10px;flex-wrap:wrap;}',
      /* TWO LINES, ALWAYS. Line one is what you do with an account you have;
         line two is everything else. Left to wrap on its own the four buttons
         broke wherever the panel width put them, so Request Access sometimes
         sat beside Sign In and read as an equal choice. */
      '.mc-auth-actions .mc-auth-break{flex:1 0 100%;height:0;margin:-10px 0 0;}',
      '.mc-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 14px;border:1px solid rgba(45,72,128,.18);border-radius:8px;background:rgba(255,255,255,.92);color:#1f2937;font:inherit;font-size:.85rem;font-weight:800;letter-spacing:.06em;text-decoration:none;cursor:pointer;}',
      '.mc-auth-btn:hover{background:#fff;}',
      '.mc-auth-btn:disabled{opacity:.5;cursor:default;}',
      '.mc-auth-btn--primary{background:#2d4880;border-color:#2d4880;color:#fff;}',
      '.mc-auth-btn--primary:hover{background:#365694;}',
      '.mc-auth-btn--google{width:100%;border-color:rgba(45,72,128,.35);}',
      '.mc-auth-btn--wide{flex:1 0 100%;}',
      /* Collapse rather than sit there as a blank line's worth of margin. */
      '.mc-auth-copy:empty{display:none;}',
      /* A rule through the middle with the word sitting in it. The lines are the
         pseudo-elements so the word keeps the panel background behind it and the
         rule appears to pass under it. */
      '.mc-auth-or{display:flex;align-items:center;gap:10px;margin:0;color:#6b7280;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;}',
      '.mc-auth-or::before,.mc-auth-or::after{content:"";flex:1;height:1px;background:rgba(45,72,128,.22);}',
      /* No reserved line when there is nothing to say. The height is kept for
         when there IS -- a message appearing without shifting the buttons under
         it is worth more than the panel being a few pixels shorter at rest. */
      '.mc-auth-status{min-height:1.4em;margin:0;color:#5c6472;font-size:.92rem;line-height:1.5;}',
      '.mc-auth-status:empty{min-height:0;}',
      '.mc-auth-status.is-error{color:#a03f2d;font-weight:700;}',
      '.mc-auth-status.is-success{color:#2f6b3d;font-weight:700;}',
      '@media (max-width:700px){.mc-auth-panel{padding:24px 20px 20px;}.mc-auth-actions>*{flex:1;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureRoot(document, options) {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = [
      '<div class="mc-auth-modal" id="mcAuthModal" hidden>',
      '  <section class="mc-auth-panel" aria-labelledby="mcAuthTitle">',
      '    <button class="mc-auth-close" id="mcAuthCloseBtn" type="button" aria-label="Close">&#x2715;</button>',
      '    <p class="mc-auth-kicker">The Game Bureau</p>',
      '    <h1 class="mc-auth-title" id="mcAuthTitle">Mission Control</h1>',
      '    <p class="mc-auth-copy" id="mcAuthCopy"></p>',
      // autocomplete="on": this is the SIGN-IN form and a password manager is
      // the right place for this credential to live. Every field below is
      // labelled with the role the manager looks for.
      '    <form class="mc-auth-form" id="mcAuthForm" autocomplete="on">',
      // GOOGLE FIRST, ABOVE THE FIELDS. It is one press against four, so it is
      // the answer for most people most of the time, and a button buried under
      // a form reads as the fallback rather than the fast path.
      //
      // GOOGLE IS ON THE SIGN-IN FORM AT ALL because an account created through
      // Google has no password: the fields below can never sign it in, so
      // offering Google only as a way to join would lock out every approved
      // Google admin.
      '      <button class="mc-auth-btn mc-auth-btn--google" id="mcAuthGoogleBtn" type="button">Continue with Google</button>',
      '      <p class="mc-auth-or"><span>or</span></p>',
      '      <label class="mc-auth-field" for="mcAuthEmail">',
      '        <span>Email</span>',
      '        <input id="mcAuthEmail" name="email" type="email" autocomplete="username" required>',
      '      </label>',
      '      <label class="mc-auth-field" for="mcAuthPassword">',
      '        <span>Password</span>',
      // CURRENT-PASSWORD, and nothing telling a manager to keep out.
      //
      // This field carried autocomplete="new-password", readonly,
      // data-lpignore and data-1p-ignore: four separate ways of saying "do not
      // offer to fill or save this", which between them defeated Chrome, Safari,
      // iCloud Keychain, 1Password and LastPass. The name is `password` because
      // managers match on it; `mc_admin_passcode` was another way of looking
      // like something other than a password field.
      '        <input id="mcAuthPassword" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required>',
      '      </label>',
      // REMEMBER ME IS GONE, AND IT IS NOW ALWAYS ON. The checkbox chose
      // between localStorage (survives closing the browser) and sessionStorage
      // (dies with the tab), and it defaulted to OFF -- so the common case was
      // signing in again every morning to a box asking a question with one
      // sensible answer. Removing the control without pinning `remember` true
      // would have made that the ONLY behaviour, which is the opposite of what
      // taking it away is meant to achieve.
      //
      // Sign Out still clears everything, which is the real control and always
      // was. rememberStorageKey / rememberedEmailStorageKey are still written
      // and read, so a session stored before this change keeps working.
      '      <div class="mc-auth-actions">',
      // FULL WIDTH, ON ITS OWN, so it mirrors Continue with Google at the top
      // of the panel: the two ways of signing in are the same size and shape,
      // and the pair below them are plainly the smaller, other things.
      '        <button class="mc-auth-btn mc-auth-btn--wide mc-auth-btn--primary" id="mcAuthSubmitBtn" type="submit">Sign In</button>',
      '        <span class="mc-auth-break" aria-hidden="true"></span>',
      '        <button class="mc-auth-btn" id="mcAuthResetBtn" type="button">Reset Password</button>',
      // THE TWO SMALL THINGS SHARE THE LAST LINE. Neither signs you in: they
      // are what you press when the two full-width buttons above have not
      // worked for you. JOIN answers the third thing somebody standing here can
      // want -- not "let me in" and not "I forgot", but "I have no account at
      // all", which before this had no answer on screen and meant knowing to
      // ask a human with Supabase dashboard access.
      '        <button class="mc-auth-btn" id="mcAuthJoinBtn" type="button">Request Access</button>',
      '      </div>',
      '    </form>',
      // autocomplete="on" here too. Changing a password is the moment a manager
      // has to be watching: if it cannot see this form it keeps the OLD
      // credential and the next sign-in fills something that no longer works.
      '    <form class="mc-auth-form" id="mcAuthPasswordResetForm" autocomplete="on" hidden>',
      '      <label class="mc-auth-field" for="mcAuthNewPassword">',
      '        <span>New Password</span>',
      // new-password is correct HERE and is what makes a manager offer to
      // generate one and then save it. The ignore attributes are gone: they were
      // stopping the save, which is the whole point of this form.
      '        <input id="mcAuthNewPassword" name="new-password" type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false" minlength="6" required>',
      '      </label>',
      '      <label class="mc-auth-field" for="mcAuthConfirmPassword">',
      '        <span>Confirm Password</span>',
      '        <input id="mcAuthConfirmPassword" name="confirm-password" type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false" minlength="6" required>',
      '      </label>',
      '      <div class="mc-auth-actions">',
      '        <button class="mc-auth-btn mc-auth-btn--primary" id="mcAuthSavePasswordBtn" type="submit">Save Password</button>',
      '        <button class="mc-auth-btn" id="mcAuthBackBtn" type="button">Back to Sign In</button>',
      '      </div>',
      '    </form>',
      // JOIN. Two steps behind one button: it signs the person up with
      // Supabase Auth, then files a request for an existing admin to approve.
      //
      // THE SIGNUP IS THEIRS TO DO, and that is not a design preference. Making
      // a Supabase Auth user for somebody else needs the service role key, and
      // this project has none (see Environment variables in CLAUDE.md). So the
      // account is created here by the person who will use it, and approval only
      // ever adds their email to public.admin_users -- the same one row a human
      // would otherwise have typed into the SQL editor.
      //
      // Until they are approved they can sign in and will be told "This account
      // is signed in, but it is not on the admin list", which is the message
      // that already existed for exactly this state.
      '    <form class="mc-auth-form" id="mcAuthJoinForm" autocomplete="on" hidden>',
      '      <button class="mc-auth-btn mc-auth-btn--google" id="mcAuthJoinGoogleBtn" type="button">Continue with Google</button>',
      '      <p class="mc-auth-or"><span>or</span></p>',
      '      <label class="mc-auth-field" for="mcAuthJoinName">',
      '        <span>Name</span>',
      '        <input id="mcAuthJoinName" name="name" type="text" autocomplete="name" maxlength="120">',
      '      </label>',
      '      <label class="mc-auth-field" for="mcAuthJoinEmail">',
      '        <span>Email</span>',
      '        <input id="mcAuthJoinEmail" name="email" type="email" autocomplete="username" required>',
      '      </label>',
      '      <label class="mc-auth-field" for="mcAuthJoinPassword">',
      '        <span>Password</span>',
      // new-password, so a manager offers to generate one and then saves it.
      // minlength matches Supabase's own floor; letting the form submit a
      // 5-character password just moves the rejection to the server.
      '        <input id="mcAuthJoinPassword" name="new-password" type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false" minlength="6" required>',
      '      </label>',
      '      <label class="mc-auth-field" for="mcAuthJoinNote">',
      '        <span>Who are you? (optional)</span>',
      '        <input id="mcAuthJoinNote" name="note" type="text" maxlength="600">',
      '      </label>',
      '      <div class="mc-auth-actions">',
      '        <button class="mc-auth-btn mc-auth-btn--primary" id="mcAuthJoinSubmitBtn" type="submit">Request Access</button>',
      '        <button class="mc-auth-btn" id="mcAuthJoinBackBtn" type="button">Back to Sign In</button>',

      '      </div>',
      '    </form>',
      '    <p class="mc-auth-status" id="mcAuthStatus" aria-live="polite"></p>',
      '  </section>',
      '</div>'
    ].join('');
    document.body.appendChild(root);
    return root;
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function createController(options) {
    var settings = Object.assign({
      storageKey: DEFAULT_STORAGE_KEY,
      legacyStorageKeys: [],
      // EMPTY, like modalCopy above it. The panel is titled Mission Control and
      // carries an email box, a password box and a Sign In button; a sentence
      // saying to sign in was telling somebody what they could already see.
      // The element stays -- it is the ERROR channel, and a failure needs
      // somewhere to land.
      initialMessage: '',
      unauthorizedMessage: 'This account is signed in, but it is not on the admin list.',
      signedOutMessage: '',
      // EMPTY. It read "Sign in to Mission Control with an admin account."
      // directly above a status line reading "Sign in with an admin account." --
      // the same sentence twice, once at each end of the panel. The status line
      // is the one that survives, because it is also where errors land.
      // Reset and JOIN keep their copy: those two modes need explaining.
      modalCopy: '',
      homeHref: '../',
      configMissingMessage: 'Admin auth is unavailable because Supabase is not configured.',
      resetCopy: 'Set a new Mission Control password from the reset link.',
      joinCopy: 'Ask for a Mission Control account. An admin approves it before you get in.',
      passwordResetRedirectHref: ''
    }, options || {});

    settings.rememberStorageKey = settings.rememberStorageKey || (settings.storageKey + REMEMBER_SUFFIX);
    settings.rememberedEmailStorageKey = settings.rememberedEmailStorageKey || (settings.storageKey + REMEMBERED_EMAIL_SUFFIX);

    var document = global.document;
    var pageProtected = isMissionControlPath()
      || !!(document.body && document.body.classList.contains('mc-auth-protected'));
    if (pageProtected && document.body) document.body.classList.add('mc-auth-protected');
    ensureStyle(document);
    var root = ensureRoot(document, settings);
    var modal = root.querySelector('#mcAuthModal');
    var closeBtn = root.querySelector('#mcAuthCloseBtn');
    var copyEl = root.querySelector('#mcAuthCopy');
    var form = root.querySelector('#mcAuthForm');
    var resetForm = root.querySelector('#mcAuthPasswordResetForm');
    var joinForm = root.querySelector('#mcAuthJoinForm');
    var joinBtn = root.querySelector('#mcAuthJoinBtn');
    var joinBackBtn = root.querySelector('#mcAuthJoinBackBtn');
    var joinSubmitBtn = root.querySelector('#mcAuthJoinSubmitBtn');
    var joinNameInput = root.querySelector('#mcAuthJoinName');
    var joinEmailInput = root.querySelector('#mcAuthJoinEmail');
    var joinPasswordInput = root.querySelector('#mcAuthJoinPassword');
    var joinNoteInput = root.querySelector('#mcAuthJoinNote');
    var googleBtn = root.querySelector('#mcAuthGoogleBtn');
    var joinGoogleBtn = root.querySelector('#mcAuthJoinGoogleBtn');
    var emailInput = root.querySelector('#mcAuthEmail');
    var passwordInput = root.querySelector('#mcAuthPassword');
    // Absent since the checkbox was removed. Kept as a lookup rather than
    // deleted so a page that supplies its own markup with the old field still
    // has it driven correctly.
    var rememberInput = root.querySelector('#mcAuthRemember');
    var resetBtn = root.querySelector('#mcAuthResetBtn');
    var newPasswordInput = root.querySelector('#mcAuthNewPassword');
    var confirmPasswordInput = root.querySelector('#mcAuthConfirmPassword');
    var savePasswordBtn = root.querySelector('#mcAuthSavePasswordBtn');
    var backBtn = root.querySelector('#mcAuthBackBtn');
    var submitBtn = root.querySelector('#mcAuthSubmitBtn');
    var statusEl = root.querySelector('#mcAuthStatus');
    // TGB HOME IS GONE from the panel. It was a way out of a sign-in box to the
    // public site, which the browser's own Back button already is, and it sat
    // beside Request Access looking like a third thing you might be here to do.
    // The homeHref SETTING stays: three pages pass one, and quietly ignoring a
    // supplied option is worse than a guarded assignment that does nothing.
    var homeBtn = root.querySelector('#mcAuthHomeBtn');
    var currentSession = null;
    var pendingRecoverySession = null;
    var rememberSession = false;
    var mode = 'signin';
    var listenersBound = false;
    var refreshTimer = null;

    copyEl.textContent = settings.modalCopy;
    if (homeBtn) homeBtn.href = settings.homeHref;

    // Clears the box between uses. It used to also stamp new-password on it and
    // flip it readonly, which put the markup back to fighting the manager
    // however the HTML was written; the sign-in field keeps current-password and
    // stays writable.
    //
    // THE TWO RESET FIELDS KEEP new-password, which is correct and is what makes
    // a manager offer to GENERATE and then SAVE a new one rather than filling
    // the old.
    function setFreshPasswordInput(input) {
      if (!input) return;
      input.value = '';
      input.defaultValue = '';
      if (input !== passwordInput) input.setAttribute('autocomplete', 'new-password');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
      input.readOnly = false;
    }

    function resetPasswordInputs() {
      setFreshPasswordInput(passwordInput);
      setFreshPasswordInput(newPasswordInput);
      setFreshPasswordInput(confirmPasswordInput);
    }

    function setPageAuthorized(signedIn) {
      if (!pageProtected || !document.body) return;
      document.body.classList.toggle('mc-auth-authorized', !!signedIn);
    }

    function setStatus(message, state) {
      statusEl.textContent = message || '';
      statusEl.classList.toggle('is-error', state === 'error');
      statusEl.classList.toggle('is-success', state === 'success');
    }

    function setMode(nextMode) {
      mode = (nextMode === 'reset' || nextMode === 'join') ? nextMode : 'signin';
      if (form) form.hidden = mode !== 'signin';
      if (resetForm) resetForm.hidden = mode !== 'reset';
      if (joinForm) joinForm.hidden = mode !== 'join';
      copyEl.textContent = mode === 'reset' ? settings.resetCopy
        : mode === 'join' ? settings.joinCopy
        : settings.modalCopy;
      resetPasswordInputs();
    }

    function setSignOutState(signedIn) {
      if (!settings.signOutButton) return;
      var title = signedIn ? 'Sign out' : 'ADMIN LOGIN';
      settings.signOutButton.title = title;
      settings.signOutButton.setAttribute('aria-label', title);
    }

    function notifyModalShow() {
      if (typeof settings.onModalShow === 'function') {
        settings.onModalShow({
          session: currentSession,
          signedIn: !!(currentSession && currentSession.access_token)
        });
      }
    }

    function notifyModalHide() {
      if (typeof settings.onModalHide === 'function') {
        settings.onModalHide({
          session: currentSession,
          signedIn: !!(currentSession && currentSession.access_token)
        });
      }
    }

    function notifyAuthChange(signedIn, session) {
      try {
        global.dispatchEvent(new CustomEvent('tgb-admin-auth-change', {
          detail: {
            signedIn: !!signedIn,
            session: session || null
          }
        }));
      } catch (error) {
      }
    }

    function openModal(message, state) {
      if (mode !== 'reset') setMode('signin');
      modal.hidden = false;
      modal.classList.add('is-open');
      setStatus(message || settings.initialMessage, state || '');
      notifyModalShow();
      global.setTimeout(function () {
        resetPasswordInputs();
        if (mode === 'reset' && newPasswordInput) {
          newPasswordInput.focus();
          return;
        }
        if (!(currentSession && currentSession.access_token) && emailInput) emailInput.focus();
      }, 0);
    }

    function closeModal() {
      if (pageProtected && !(currentSession && currentSession.access_token)) return;
      modal.classList.remove('is-open');
      modal.hidden = true;
      notifyModalHide();
    }

    function removeLegacySessions() {
      settings.legacyStorageKeys.forEach(function (key) {
        if (!key || key === settings.storageKey) return;
        try {
          global.localStorage.removeItem(key);
        } catch (error) {
        }
      });
    }

    function readStorageKey(key, storage) {
      if (!key) return null;
      var store = storage || global.localStorage;
      try {
        return JSON.parse(store.getItem(key) || 'null');
      } catch (error) {
        return null;
      }
    }

    function readStoredText(key) {
      try {
        return String(global.localStorage.getItem(key) || '');
      } catch (error) {
        return '';
      }
    }

    function writeStoredText(key, value) {
      try {
        if (value) global.localStorage.setItem(key, String(value));
        else global.localStorage.removeItem(key);
      } catch (error) {
      }
    }

    function readRememberPreference() {
      return readStoredText(settings.rememberStorageKey) === '1';
    }

    function setRememberPreference(remember) {
      writeStoredText(settings.rememberStorageKey, remember ? '1' : '');
    }

    function setRememberUi(remember) {
      rememberSession = !!remember;
      if (rememberInput) rememberInput.checked = rememberSession;
      if (rememberSession && emailInput && !emailInput.value) {
        emailInput.value = readStoredText(settings.rememberedEmailStorageKey);
      }
    }

    function clearStoredSessions() {
      try { global.localStorage.removeItem(settings.storageKey); } catch (error) {}
      try { global.sessionStorage.removeItem(settings.storageKey); } catch (error) {}
      removeLegacySessions();
    }

    function readStoredSession() {
      var tabSession = readStorageKey(settings.storageKey, global.sessionStorage);
      if (tabSession && tabSession.access_token) {
        setRememberUi(false);
        return tabSession;
      }

      var stored = readStorageKey(settings.storageKey, global.localStorage);
      if (stored && stored.access_token) {
        setRememberUi(true);
        return stored;
      }

      var migrated = null;
      settings.legacyStorageKeys.some(function (key) {
        var legacy = readStorageKey(key, global.localStorage);
        if (legacy && legacy.access_token) {
          migrated = legacy;
          return true;
        }
        return false;
      });

      if (migrated) storeSession(migrated, true);
      return migrated;
    }

    function storeSession(session, remember) {
      try {
        global.localStorage.removeItem(settings.storageKey);
        global.sessionStorage.removeItem(settings.storageKey);
        if (session) {
          // Remember Me persists the Supabase session only, never the password.
          if (remember) global.localStorage.setItem(settings.storageKey, JSON.stringify(session));
          else global.sessionStorage.setItem(settings.storageKey, JSON.stringify(session));
        }
      } catch (error) {
      }
      removeLegacySessions();
      if (session) {
        setRememberUi(!!remember);
        setRememberPreference(!!remember);
        var rememberedEmail = String(
          (session.user && session.user.email) || (emailInput && emailInput.value) || ''
        ).trim();
        writeStoredText(settings.rememberedEmailStorageKey, remember ? rememberedEmail : '');
      }
    }

    function authUrl(path) {
      return new URL('/auth/v1/' + String(path || '').replace(/^\/+/, ''), settings.supabaseConfig.url + '/').toString();
    }

    function restUrl(table, params) {
      var url = new URL('/rest/v1/' + encodeURIComponent(table), settings.supabaseConfig.url + '/');
      Object.entries(params || {}).forEach(function (entry) {
        var key = entry[0];
        var value = entry[1];
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    }

    async function readError(response, fallback) {
      var defaultMessage = fallback || 'Request failed.';
      try {
        var text = await response.text();
        if (!text) return defaultMessage;
        try {
          var payload = JSON.parse(text);
          var message = payload.message || payload.msg || payload.error_description || payload.error || text;
          if (/public\.admin_users|admin_users/i.test(message) && /schema cache|could not find/i.test(message)) {
            return 'Admin access is not set up yet. Run mc/_dev/docs/supabase/photo-submissions.sql in Supabase, then add your email to public.admin_users.';
          }
          return message;
        } catch (error) {
          return text;
        }
      } catch (error) {
        return defaultMessage;
      }
    }

    async function fetchUser(accessToken) {
      var response = await fetch(authUrl('user'), {
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          Authorization: 'Bearer ' + accessToken
        }
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Could not verify the current user.'));
      }
      return response.json();
    }

    async function normalizeSession(payload, fallbackRefreshToken) {
      if (!payload || !payload.access_token) throw new Error('Session was missing an access token.');
      var user = payload.user || await fetchUser(payload.access_token);
      return {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token || fallbackRefreshToken || '',
        expires_at: payload.expires_at || Math.floor((Date.now() + ((payload.expires_in || 3600) * 1000)) / 1000),
        user: user || null
      };
    }

    async function signIn(email, password) {
      var response = await fetch(authUrl('token?grant_type=password'), {
        method: 'POST',
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email, password: password })
      });
      if (!response.ok) throw new Error(await readError(response, 'Sign in failed.'));
      return normalizeSession(await response.json());
    }

    function resetRedirectHref() {
      if (settings.passwordResetRedirectHref) {
        return new URL(settings.passwordResetRedirectHref, global.location.href).toString();
      }
      if (isMissionControlPath()) {
        return new URL('/mc/', global.location.href).toString();
      }
      var url = new URL(global.location.href);
      url.hash = '';
      return url.toString();
    }

    async function recoverPassword(email) {
      var redirectTo = resetRedirectHref();
      var url = authUrl('recover');
      if (redirectTo) url += '?redirect_to=' + encodeURIComponent(redirectTo);
      var request = {
        method: 'POST',
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email })
      };
      var response = await fetch(url, request);
      if (!response.ok) throw new Error(await readError(response, 'Could not send reset email.'));
      return true;
    }

    async function updatePassword(session, password) {
      if (!session || !session.access_token) throw new Error('Password reset session is missing.');
      var response = await fetch(authUrl('user'), {
        method: 'PUT',
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password })
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not update password.'));
      var payload = await response.json();
      session.user = (payload && payload.user) || payload || session.user || null;
      return session;
    }

    async function refreshSession(session) {
      if (!session || !session.refresh_token) return null;
      var response = await fetch(authUrl('token?grant_type=refresh_token'), {
        method: 'POST',
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) return null;
      return normalizeSession(await response.json(), session.refresh_token);
    }

    async function getUsableSession() {
      var stored = readStoredSession();
      if (!stored || !stored.access_token) return null;
      var expiresAt = Number(stored.expires_at || 0) * 1000;
      if (expiresAt && expiresAt > Date.now() + 60000) {
        if (!stored.user || !stored.user.email) {
          stored.user = await fetchUser(stored.access_token);
          storeSession(stored);
        }
        return stored;
      }
      var refreshed = await refreshSession(stored);
      if (refreshed && refreshed.access_token) {
        storeSession(refreshed);
        return refreshed;
      }
      storeSession(null);
      return null;
    }

    function headersForSession(session, extra) {
      return {
        apikey: settings.supabaseConfig.publishableKey,
        Authorization: 'Bearer ' + ((session && session.access_token) || ''),
        ...(extra || {})
      };
    }

    function authHeaders(extra) {
      return headersForSession(currentSession, extra);
    }

    async function verifyAdminTable(session) {
      var email = session && session.user ? session.user.email : '';
      var response = await fetch(restUrl('admin_users', {
        select: 'email',
        email: 'eq.' + email,
        limit: '1'
      }), {
        headers: headersForSession(session, { Accept: 'application/json' }),
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Could not verify admin access.'));
      }
      var rows = await response.json();
      return Array.isArray(rows) && rows.length > 0;
    }

    async function verifySession(session) {
      if (typeof settings.verifySession === 'function') {
        return settings.verifySession(session, {
          authUrl: authUrl,
          restUrl: restUrl,
          readError: readError,
          verifyAdminTable: verifyAdminTable,
          headersForSession: headersForSession
        });
      }
      return verifyAdminTable(session);
    }

    async function logoutSession(session) {
      if (!session || !session.access_token || !hasConfig(settings.supabaseConfig)) return;
      try {
        await fetch(authUrl('logout'), {
          method: 'POST',
          headers: {
            apikey: settings.supabaseConfig.publishableKey,
            Authorization: 'Bearer ' + session.access_token
          }
        });
      } catch (error) {
      }
    }

    function clearRefreshTimer() {
      if (refreshTimer) {
        global.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    function scheduleRefresh(session) {
      clearRefreshTimer();
      if (!session || !session.refresh_token || !session.expires_at) return;
      var msUntilExpiry = (Number(session.expires_at) * 1000) - Date.now();
      // Renew ~60s before expiry, but never sooner than 5s from now.
      var delay = Math.max(msUntilExpiry - 60000, 5000);
      refreshTimer = global.setTimeout(function () { renewSession(); }, delay);
    }

    // Refresh the access token using the refresh token. On failure (refresh
    // token also dead) the session is cleared and the login modal is shown.
    async function renewSession() {
      clearRefreshTimer();
      if (!currentSession) return null;
      var refreshed = await refreshSession(currentSession);
      if (refreshed && refreshed.access_token) {
        currentSession = refreshed;
        storeSession(refreshed, rememberSession);
        scheduleRefresh(refreshed);
        setPageAuthorized(true);
        notifyAuthChange(true, refreshed);
        return refreshed;
      }
      currentSession = null;
      storeSession(null);
      setSignOutState(false);
      setPageAuthorized(false);
      notifyAuthChange(false, null);
      if (typeof settings.onSignedOut === 'function') {
        try { await settings.onSignedOut(null); } catch (error) {}
      }
      showAuth(settings.signedOutMessage || settings.initialMessage, 'error');
      return null;
    }

    // Callers can await this before an authenticated request to guarantee the
    // access token is still valid (refreshing it if it is about to expire).
    async function ensureFreshSession() {
      if (currentSession && currentSession.expires_at) {
        var msUntilExpiry = (Number(currentSession.expires_at) * 1000) - Date.now();
        if (msUntilExpiry > 60000) return currentSession;
      }
      return renewSession();
    }

    async function activateSession(session, remember) {
      currentSession = session;
      storeSession(session, !!remember);
      scheduleRefresh(session);
      // NOT CLEARED SYNCHRONOUSLY. A browser decides whether to offer "save this
      // password?" by looking at the form just after it is submitted; emptying
      // the field in the same tick reads as "there was no password here" and the
      // prompt never appears. One frame is enough for it to have looked.
      //
      // The field is still cleared, so a signed-out page never holds a
      // credential in the DOM; it just happens a moment later.
      window.setTimeout(resetPasswordInputs, 400);
      setMode('signin');
      setSignOutState(true);
      setPageAuthorized(true);
      closeModal();
      notifyAuthChange(true, session);
      if (typeof settings.onAuthorized === 'function') {
        await settings.onAuthorized(session);
      }
      return session;
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (!hasConfig(settings.supabaseConfig)) {
        setStatus(settings.configMissingMessage, 'error');
        return;
      }

      var email = String(emailInput.value || '').trim();
      var password = String(passwordInput.value || '');
      if (!email || !password) return;
      var remember = true;

      submitBtn.disabled = true;
      setStatus('Signing in...');
      try {
        var session = await signIn(email, password);
        var isAllowed = await verifySession(session);
        if (!isAllowed) {
          throw new Error(settings.unauthorizedMessage);
        }
        await activateSession(session, remember);
      } catch (error) {
        currentSession = null;
        storeSession(null);
        setSignOutState(false);
        setPageAuthorized(false);
        setStatus(error instanceof Error ? error.message : String(error), 'error');
        openModal(statusEl.textContent, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    }

    async function handleRecoverClick() {
      if (!hasConfig(settings.supabaseConfig)) {
        setStatus(settings.configMissingMessage, 'error');
        return;
      }
      var email = String(emailInput.value || '').trim();
      if (!email) {
        setStatus('Enter your email first.', 'error');
        if (emailInput) emailInput.focus();
        return;
      }
      if (resetBtn) resetBtn.disabled = true;
      setStatus('Sending reset email...');
      try {
        await recoverPassword(email);
        setStatus('If that admin account exists, a reset link is on the way.', 'success');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        if (resetBtn) resetBtn.disabled = false;
      }
    }

    // JOIN: sign up, then file the request. Two calls, and the order matters --
    // the account has to exist before an approval is worth anything, and a
    // request filed for an address that never completes signup is a row an admin
    // approves into an admin_users entry nobody can sign in as.
    async function handleJoinSubmit(event) {
      event.preventDefault();
      if (!hasConfig(settings.supabaseConfig)) {
        setStatus(settings.configMissingMessage, 'error');
        return;
      }
      var email = String(joinEmailInput.value || '').trim().toLowerCase();
      var password = String(joinPasswordInput.value || '');
      if (password.length < 6) {
        setStatus('Use at least 6 characters.', 'error');
        return;
      }
      if (joinSubmitBtn) joinSubmitBtn.disabled = true;
      setStatus('Sending your request...');
      try {
        var signup = await fetch(authUrl('signup'), {
          method: 'POST',
          headers: {
            apikey: settings.supabaseConfig.publishableKey,
            'Content-Type': 'application/json'
          },
          // WHERE THE CONFIRMATION EMAIL LANDS, if the project has Confirm
          // Email on. Without it Supabase falls back to the Site URL, which is
          // the root of thegamebureau.com -- an iframe wrapper around /games/,
          // with no sign-in form on it. Somebody who has just confirmed their
          // address would arrive at the storefront with nothing to do.
          // /mc/ has to be on the Redirect URLs allow list or this is ignored.
          body: JSON.stringify({
            email: email,
            password: password,
            options: { email_redirect_to: new URL('/mc/', global.location.href).toString() }
          })
        });
        if (!signup.ok) {
          var detail = await readError(signup, 'Could not create the account.');
          // AN EXISTING ACCOUNT IS NOT A FAILURE HERE. Somebody who signed up,
          // was never approved and has come back to ask again would otherwise
          // be stopped by their own earlier attempt, with an error naming a
          // problem they cannot fix. Carry on and file the request.
          if (!/already|registered|exists/i.test(detail)) throw new Error(detail);
        }

        await fileAccessRequest(
          email,
          String(joinNameInput.value || '').trim(),
          String(joinNoteInput.value || '').trim()
        );

        joinPasswordInput.value = '';
        // DELIBERATELY SAYS NOTHING ABOUT WHAT WAS ALREADY THERE. The RPC gives
        // the same answer whether this is a new request, a repeat, or an address
        // that is already an admin, so that an unauthenticated caller cannot use
        // this form to test who is on the list. The message matches.
        setStatus('Request sent. An admin has to approve it before you can get in.', 'success');
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Could not send the request.', 'error');
      } finally {
        if (joinSubmitBtn) joinSubmitBtn.disabled = false;
      }
    }

    async function handleResetSubmit(event) {
      event.preventDefault();
      if (!pendingRecoverySession) {
        setStatus('Open the latest password reset email and use its link first.', 'error');
        return;
      }
      var nextPassword = String(newPasswordInput.value || '');
      var confirmPassword = String(confirmPasswordInput.value || '');
      if (nextPassword.length < 6) {
        setStatus('Use at least 6 characters.', 'error');
        return;
      }
      if (nextPassword !== confirmPassword) {
        setStatus('The passwords do not match.', 'error');
        return;
      }
      if (savePasswordBtn) savePasswordBtn.disabled = true;
      setStatus('Saving password...');
      try {
        var session = await updatePassword(pendingRecoverySession, nextPassword);
        var isAllowed = await verifySession(session);
        if (!isAllowed) throw new Error(settings.unauthorizedMessage);
        pendingRecoverySession = null;
        await activateSession(session, false);
        setStatus('Password updated.', 'success');
      } catch (error) {
        currentSession = null;
        storeSession(null);
        setPageAuthorized(false);
        setStatus(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        resetPasswordInputs();
        if (savePasswordBtn) savePasswordBtn.disabled = false;
      }
    }

    async function signOut(options) {
      var previousSession = currentSession || readStoredSession();
      clearRefreshTimer();
      currentSession = null;
      clearStoredSessions();
      setRememberUi(false);
      setRememberPreference(false);
      writeStoredText(settings.rememberedEmailStorageKey, '');
      setSignOutState(false);
      setPageAuthorized(false);
      notifyAuthChange(false, previousSession);
      if (typeof settings.onSignedOut === 'function') {
        await settings.onSignedOut(previousSession);
      }
      await logoutSession(previousSession);
      if (pageProtected || !(options && options.silent)) {
        openModal((options && options.message) || settings.signedOutMessage, (options && options.state) || '');
      }
      return true;
    }

    function showAuth(message, state) {
      setSignOutState(false);
      pendingRecoverySession = null;
      setMode('signin');
      openModal(message || settings.initialMessage, state || '');
    }

    // GOOGLE. Two halves that happen in different page loads: startOAuth sends
    // the browser to Supabase, and parseOAuthParams picks the tokens back out of
    // the URL when it returns.
    //
    // The INTENT has to survive that round trip, and it cannot ride in the URL:
    // Supabase replaces the whole hash with its own tokens, so anything parked
    // there is gone by the time we read it. sessionStorage instead, cleared the
    // moment it is used so a later plain sign-in cannot file a stray request.
    var JOIN_INTENT_KEY = 'tgb_mc_join_intent';

    function startOAuth(provider, wantsJoin) {
      if (!hasConfig(settings.supabaseConfig)) {
        setStatus(settings.configMissingMessage, 'error');
        return;
      }
      try {
        if (wantsJoin) global.sessionStorage.setItem(JOIN_INTENT_KEY, '1');
        else global.sessionStorage.removeItem(JOIN_INTENT_KEY);
      } catch (error) { /* private mode: the sign-in still works, the auto-file does not */ }
      // Back to THIS page, hash stripped. On /mc/ that is Mission Control; on a
      // public page it is the page the admin was reading.
      var back = new URL(global.location.href);
      back.hash = '';
      var url = authUrl('authorize')
        + '?provider=' + encodeURIComponent(provider)
        + '&redirect_to=' + encodeURIComponent(back.toString());
      global.location.assign(url);
    }

    function takeJoinIntent() {
      var wanted = false;
      try {
        wanted = global.sessionStorage.getItem(JOIN_INTENT_KEY) === '1';
        global.sessionStorage.removeItem(JOIN_INTENT_KEY);
      } catch (error) { wanted = false; }
      return wanted;
    }

    // Same hash shape as a recovery link minus `type=recovery`, which is what
    // separates the two and why parseRecoveryParams keeps its own check.
    function parseOAuthParams() {
      var raw = '';
      try { raw = String(global.location.hash || '').replace(/^#/, ''); } catch (error) { raw = ''; }
      if (!raw) return null;
      var params = new URLSearchParams(raw);
      if (params.get('type') === 'recovery') return null;
      if (!params.get('access_token')) return null;
      return {
        access_token: params.get('access_token') || '',
        refresh_token: params.get('refresh_token') || '',
        expires_in: Number(params.get('expires_in') || 3600),
        expires_at: Number(params.get('expires_at') || 0) || undefined,
        token_type: params.get('token_type') || 'bearer'
      };
    }

    // NOT restUrl(). That helper runs its argument through encodeURIComponent,
    // which is right for a table name and fatal for an RPC path: the slash in
    // "rpc/tgb_request_admin_access" came back as %2F, so every call 404'd and
    // the catch around it swallowed the failure silently. The request looked
    // sent and nothing was ever filed.
    function rpcUrl(name) {
      return new URL('/rest/v1/rpc/' + name, settings.supabaseConfig.url + '/').toString();
    }

    async function fileAccessRequest(email, name, note) {
      var response = await fetch(rpcUrl('tgb_request_admin_access'), {
        method: 'POST',
        headers: {
          apikey: settings.supabaseConfig.publishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: { email: email, name: name || '', note: note || '' } })
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not file the request.'));
    }

    function parseRecoveryParams() {
      var raw = '';
      try {
        raw = String(global.location.hash || '').replace(/^#/, '');
      } catch (error) {
        raw = '';
      }
      if (!raw) return null;
      var params = new URLSearchParams(raw);
      if (params.get('type') !== 'recovery' || !params.get('access_token')) return null;
      return {
        access_token: params.get('access_token') || '',
        refresh_token: params.get('refresh_token') || '',
        expires_in: Number(params.get('expires_in') || 3600),
        expires_at: Number(params.get('expires_at') || 0) || undefined,
        token_type: params.get('token_type') || 'bearer'
      };
    }

    function clearRecoveryParams() {
      try {
        if (!global.history || !global.history.replaceState) return;
        var url = new URL(global.location.href);
        if (!url.hash) return;
        url.hash = '';
        global.history.replaceState(null, document.title, url.toString());
      } catch (error) {
      }
    }

    function showPasswordReset(message, state) {
      setSignOutState(false);
      setMode('reset');
      openModal(message || 'Enter a new password.', state || '');
    }

    function bindListeners() {
      if (listenersBound) return;
      listenersBound = true;

      form.addEventListener('submit', handleSubmit);
      passwordInput.addEventListener('focus', function () {
        passwordInput.readOnly = false;
        passwordInput.value = '';
      });
      passwordInput.addEventListener('pointerdown', function () {
        passwordInput.readOnly = false;
      });
      resetForm.addEventListener('submit', handleResetSubmit);
      if (joinForm) joinForm.addEventListener('submit', handleJoinSubmit);
      if (joinBtn) joinBtn.addEventListener('click', function () {
        setStatus('');
        setMode('join');
        // Carry whatever they already typed on the sign-in form across, so
        // reaching for JOIN after a failed sign-in does not mean retyping it.
        if (joinEmailInput && !joinEmailInput.value) joinEmailInput.value = emailInput.value || '';
        if (joinEmailInput) joinEmailInput.focus();
      });
      if (googleBtn) googleBtn.addEventListener('click', function () {
        setStatus('Opening Google...');
        startOAuth('google', false);
      });
      if (joinGoogleBtn) joinGoogleBtn.addEventListener('click', function () {
        setStatus('Opening Google...');
        startOAuth('google', true);
      });
      if (joinBackBtn) joinBackBtn.addEventListener('click', function () {
        setStatus(settings.initialMessage);
        setMode('signin');
      });
      resetBtn.addEventListener('click', handleRecoverClick);
      backBtn.addEventListener('click', function () {
        pendingRecoverySession = null;
        showAuth(settings.initialMessage);
      });
      closeBtn.addEventListener('click', closeModal);

      // Laptop sleep / long-backgrounded tabs can pause the refresh timer past
      // expiry — re-check and renew the moment the tab becomes visible again.
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState !== 'visible') return;
        if (!currentSession || !currentSession.expires_at) return;
        var msUntilExpiry = (Number(currentSession.expires_at) * 1000) - Date.now();
        if (msUntilExpiry < 120000) renewSession();
      });

      if (settings.signOutButton) {
        settings.signOutButton.addEventListener('click', function () {
          if (currentSession && currentSession.access_token) signOut();
          else showAuth();
        });
      }
    }

    async function init() {
      bindListeners();
      setPageAuthorized(false);
      // TRUE, not the stored preference: an admin who signed in before this
      // change has '' stored, and reading it would put them back on tab-only
      // sessions for good with no control left to fix it.
      setRememberUi(true);
      resetPasswordInputs();

      if (!hasConfig(settings.supabaseConfig)) {
        setSignOutState(false);
        submitBtn.disabled = true;
        emailInput.disabled = true;
        passwordInput.disabled = true;
        if (rememberInput) rememberInput.disabled = true;
        if (resetBtn) resetBtn.disabled = true;
        if (savePasswordBtn) savePasswordBtn.disabled = true;
        showAuth(settings.configMissingMessage, 'error');
        return false;
      }

      submitBtn.disabled = false;
      emailInput.disabled = false;
      passwordInput.disabled = false;
      if (rememberInput) rememberInput.disabled = false;
      if (resetBtn) resetBtn.disabled = false;
      if (savePasswordBtn) savePasswordBtn.disabled = false;

      var recoveryPayload = parseRecoveryParams();
      if (recoveryPayload) {
        try {
          pendingRecoverySession = await normalizeSession(recoveryPayload);
          clearRecoveryParams();
          showPasswordReset('Enter a new password for this admin account.', 'success');
          return false;
        } catch (error) {
          pendingRecoverySession = null;
          clearRecoveryParams();
          showAuth(error instanceof Error ? error.message : String(error), 'error');
          return false;
        }
      }

      // BACK FROM GOOGLE. Handled here rather than in getUsableSession because
      // the tokens are in the URL, not in storage, and because the answer for a
      // signed-in-but-not-approved person is a message and a button rather than
      // a failure.
      var oauthPayload = parseOAuthParams();
      if (oauthPayload) {
        var wantsJoin = takeJoinIntent();
        try {
          var oauthSession = await normalizeSession(oauthPayload);
          clearRecoveryParams();
          var oauthEmail = (oauthSession.user && oauthSession.user.email) || '';
          var oauthAllowed = await verifySession(oauthSession);
          if (oauthAllowed) {
            await activateSession(oauthSession, rememberSession);
            return true;
          }

          // NOT ON THE LIST? FILE THE REQUEST, whichever Google button they
          // pressed. This used to depend on `wantsJoin`, an intent set by the
          // JOIN form's button and not by the identical-looking one on the
          // sign-in form -- so somebody who reasonably pressed the first Google
          // button they saw was told they were not an admin and nothing was
          // filed, leaving them stuck and the admin with an empty queue.
          //
          // Signing in to Mission Control IS the request. There is nothing else
          // to want here, the RPC dedupes, and a filed request grants nothing
          // on its own. wantsJoin now only chooses the wording.
          var filedOk = false;
          var filedError = '';
          if (oauthEmail) {
            try {
              await fileAccessRequest(oauthEmail, '', 'Signed in with Google');
              filedOk = true;
            } catch (error) {
              // SAY SO. This was a bare catch that fell back to "you are not an
              // admin", which is a true sentence describing the wrong problem:
              // it sent the person away thinking they had been refused when the
              // request had never been filed, and left no trace anywhere.
              filedError = error && error.message ? error.message : String(error);
            }
          }
          showAuth(filedOk
            ? 'Request sent. An admin has to approve it before you can get in.'
            : filedError
              ? 'Signed in, but the access request could not be filed: ' + filedError
              : settings.unauthorizedMessage,
            filedOk ? 'success' : 'error');
          return false;
        } catch (error) {
          clearRecoveryParams();
          showAuth(error instanceof Error ? error.message : String(error), 'error');
          return false;
        }
      }

      var session = await getUsableSession();
      if (!session) {
        currentSession = null;
        setSignOutState(false);
        setPageAuthorized(false);
        showAuth(settings.initialMessage);
        return false;
      }

      try {
        var isAllowed = await verifySession(session);
        if (!isAllowed) throw new Error(settings.unauthorizedMessage);
        await activateSession(session, rememberSession);
        return true;
      } catch (error) {
        currentSession = null;
        storeSession(null);
        setSignOutState(false);
        setPageAuthorized(false);
        showAuth(error instanceof Error ? error.message : String(error), 'error');
        return false;
      }
    }

    return {
      init: init,
      showAuth: showAuth,
      signOut: signOut,
      close: closeModal,
      getSession: function () { return currentSession; },
      ensureFreshSession: ensureFreshSession,
      authHeaders: authHeaders,
      headersForSession: headersForSession,
      restUrl: restUrl,
      authUrl: authUrl,
      readError: readError,
      recoverPassword: recoverPassword,
      verifyAdminTable: verifyAdminTable,
      readStoredSession: readStoredSession,
      storeSession: storeSession,
      setStatus: setStatus
    };
  }

  global.TgbMcAdminAuth = {
    create: createController
  };
}(window));
