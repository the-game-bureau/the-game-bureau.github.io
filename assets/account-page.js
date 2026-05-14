document.addEventListener('DOMContentLoaded', () => {
  const account = window.TGBAccount;
  if (!account) return;

  const signedOutPanel = document.getElementById('signedOutPanel');
  const signedInPanel = document.getElementById('signedInPanel');
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');
  const profileForm = document.getElementById('profileForm');
  const signOutBtn = document.getElementById('accountSignOutBtn');
  const recoverBtn = document.getElementById('recoverBtn');
  const modeBtns = document.querySelectorAll('[data-auth-mode-btn]');
  const signInStatus = document.getElementById('signInStatus');
  const signUpStatus = document.getElementById('signUpStatus');
  const profileStatus = document.getElementById('profileStatus');
  const accountEmail = document.getElementById('accountEmail');
  const accountName = document.getElementById('accountName');
  const displayNameInput = document.getElementById('displayNameInput');

  function setStatus(el, message, state) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', state === 'error');
    el.classList.toggle('is-success', state === 'success');
  }

  function setMode(mode) {
    const target = mode === 'signup' ? 'signup' : 'signin';
    document.querySelectorAll('[data-auth-mode]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.authMode !== target);
    });
    modeBtns.forEach((button) => {
      const active = button.dataset.authModeBtn === target;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    setStatus(signInStatus, '');
    setStatus(signUpStatus, '');
  }

  function renderSignedOut() {
    signedOutPanel.classList.remove('hidden');
    signedInPanel.classList.add('hidden');
  }

  function renderSignedIn(session) {
    const email = account.getEmail(session);
    const name = account.getDisplayName(session);
    signedOutPanel.classList.add('hidden');
    signedInPanel.classList.remove('hidden');
    accountEmail.textContent = email || 'Signed in';
    accountName.textContent = name || 'Field agent';
    displayNameInput.value = name;
    setStatus(profileStatus, '');
  }

  async function refresh() {
    const session = await account.getSession();
    if (session) renderSignedIn(session);
    else renderSignedOut();
  }

  modeBtns.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.authModeBtn));
  });

  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(signInStatus, 'Signing in...');
    const form = new FormData(signInForm);
    try {
      const session = await account.signIn(
        String(form.get('email') || '').trim(),
        String(form.get('password') || '')
      );
      setStatus(signInStatus, 'Signed in.', 'success');
      renderSignedIn(session);
    } catch (error) {
      setStatus(signInStatus, error instanceof Error ? error.message : String(error), 'error');
    }
  });

  signUpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(signUpStatus, 'Creating account...');
    const form = new FormData(signUpForm);
    const displayName = String(form.get('display_name') || '').trim();
    try {
      await account.signUp(
        String(form.get('email') || '').trim(),
        String(form.get('password') || ''),
        displayName ? { display_name: displayName } : {}
      );
      const session = await account.getSession();
      if (session) {
        setStatus(signUpStatus, 'Account created.', 'success');
        renderSignedIn(session);
      } else {
        setMode('signin');
        setStatus(signInStatus, 'Check your email to confirm the account, then sign in.', 'success');
      }
    } catch (error) {
      setStatus(signUpStatus, error instanceof Error ? error.message : String(error), 'error');
    }
  });

  recoverBtn.addEventListener('click', async () => {
    const emailInput = signInForm.querySelector('[name="email"]');
    const email = String(emailInput && emailInput.value || '').trim();
    if (!email) {
      setStatus(signInStatus, 'Enter your email first.', 'error');
      return;
    }
    setStatus(signInStatus, 'Sending reset email...');
    try {
      await account.recoverPassword(email);
      setStatus(signInStatus, 'Password reset email sent if the account exists.', 'success');
    } catch (error) {
      setStatus(signInStatus, error instanceof Error ? error.message : String(error), 'error');
    }
  });

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(profileStatus, 'Saving...');
    try {
      const user = await account.updateUser({
        display_name: String(displayNameInput.value || '').trim()
      });
      const session = await account.getSession();
      renderSignedIn({ ...session, user });
      setStatus(profileStatus, 'Saved.', 'success');
    } catch (error) {
      setStatus(profileStatus, error instanceof Error ? error.message : String(error), 'error');
    }
  });

  signOutBtn.addEventListener('click', async () => {
    await account.signOut();
    renderSignedOut();
  });

  setMode('signin');
  refresh().catch(() => renderSignedOut());
});
