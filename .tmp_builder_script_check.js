
// TGB Builder writes Supabase-backed game data that is read later by the game engine.
const TYPE_CONFIG = {
  game: {
    width: 184,
    height: 318,
    kicker: 'GAME',
    title: '!AAA Great Game!',
    body: 'A guided SMS adventure through the city.',
    code: 'GM'
  },
  stop: {
    width: 236,
    height: 90,
    kicker: 'WAYPOINT',
    title: 'WAYPOINT NAME',
    body: '',
    code: 'ST'
  },
  bubble: {
    width: 250,
    height: 92,
    kicker: 'GUIDE MSG',
    title: '',
    body: '',
    code: 'BB'
  },
  reply: {
    width: 230,
    height: 88,
    kicker: 'PLAYER MSG',
    title: '',
    body: '',
    code: 'RP'
  },
  button: {
    width: 236,
    height: 70,
    kicker: 'BUTTON',
    title: 'BUY GAME TO CONTINUE',
    body: '',
    code: 'BT'
  },
};
const NODE_ID_PREFIX = {
  game: 'gm',
  stop: 'st',
  bubble: 'gd',
  reply: 'pl',
  button: 'bt'
};
const NODE_TYPE_BY_PREFIX = Object.fromEntries(
  Object.entries(NODE_ID_PREFIX).map(([type, prefix]) => [prefix, type])
);

const ALL_TAGS = ['Featured', 'Mystery', 'Puzzle', 'SMS', 'Walking Tour', 'Sports', 'History', 'Food', 'Adventure', 'Family', 'Conspiracy', 'Trivia', 'Horror', 'Romance', 'Comedy', 'Music', 'Culture', 'Night Life', 'City Tour', 'Scavenger Hunt', 'New Orleans'];
const FEATURED_TAG = 'Featured';

const LOCAL_OPEN_GAME_KEY = 'tgb-games-phoneanalogy-open';
const LOCAL_RECOVERY_KEY = 'tgb-games-phoneanalogy-recovery';
const EDITOR_LAUNCH_INTENT_KEY = 'tgb-builder-launch-intent';
const STORE_COMMENT = 'Supabase-backed game builder store.';
const RECOVERY_VERSION = 1;
const RECOVERY_SAVE_DELAY_MS = 900;
const GAMES_PAGE_ROUTE = '../archive/index_old.html';
const HEADER_GAME_PLACEHOLDER_VALUE = '__pick-game__';
const HEADER_GAME_NEW_VALUE = '__new-game__';
const SUPABASE_CONFIG_STORAGE_KEY = 'tgb-builder-supabase-config';
const DEFAULT_SUPABASE_GAMES_TABLE = 'games';
const SUPABASE_STORAGE_KIND = 'supabase';
const ARCHIVED_GAME_VALUE = 'YES';
const ERASED_GAME_VALUE = 'YES';
const FEATURED_GAME_VALUE = 'YES';
const SUPABASE_GAMES_SCHEMA = {
  featured: true,
  city: true
};
const supabaseConfig = readSupabaseConfig();

const BUILDER_AUTH_STORAGE_KEY = 'tgb-builder-auth-session';
const BUILDER_AUTH_REFRESH_BUFFER_MS = 60000;
const BUILDER_ALLOWED_EMAILS = [];
const BUILDER_ACCESS_REQUEST_EMAIL = 'kevinmkolb@gmail.com';
let builderHasInitialized = false;

// Load tags from Supabase on startup
let allTags = [...ALL_TAGS];
let supabaseTags = [];

async function loadTagsFromSupabase() {
  try {
    if (!hasSupabaseStore()) return;

    const response = await fetch(buildSupabaseUrl({
      select: 'name',
      order: 'name.asc'
    }, 'tags'), {
      cache: 'no-store',
      headers: getSupabaseHeaders({
        Accept: 'application/json'
      })
    });

    if (!response.ok) {
      console.warn('Failed to load tags from Supabase:', await response.text());
      return;
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const seenLower = new Set(ALL_TAGS.map(t => t.toLowerCase()));
      const merged = [...ALL_TAGS];
      data.forEach(row => {
        if (row.name && !seenLower.has(row.name.toLowerCase())) {
          seenLower.add(row.name.toLowerCase());
          merged.push(row.name);
        }
      });
      supabaseTags = merged.slice(ALL_TAGS.length);
      allTags = merged.sort((a, b) => a.localeCompare(b));
    }
  } catch (err) {
    console.warn('Error loading tags from Supabase:', err);
  }
}

async function saveNewTagToSupabase(tagName) {
  try {
    if (!hasSupabaseStore()) return;

    const response = await fetch(buildSupabaseUrl(null, 'tags'), {
      method: 'POST',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify([{ name: tagName }])
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (!errorText.includes('23505')) {
        console.warn('Failed to save tag to Supabase:', errorText);
      }
    }
  } catch (err) {
    console.warn('Error saving tag to Supabase:', err);
  }
}

async function mergeAllGameTagsToSupabase() {
  if (!hasSupabaseStore()) return;
  try {
    const rows = await fetchGameRowsFromSupabase(buildGamesSelectColumns(['id', 'nodes']));
    const knownLower = new Set([...ALL_TAGS, ...supabaseTags].map(t => t.toLowerCase()));
    const saves = [];
    rows.forEach((row) => {
      const nodes = Array.isArray(row.nodes) ? row.nodes : [];
      nodes.forEach((node) => {
        (node.tags || []).forEach((tag) => {
          if (tag && !knownLower.has(tag.toLowerCase())) {
            knownLower.add(tag.toLowerCase());
            supabaseTags.push(tag);
            saves.push(saveNewTagToSupabase(tag));
          }
        });
      });
    });
    if (saves.length) {
      await Promise.allSettled(saves);
      allTags = [...ALL_TAGS, ...supabaseTags].sort((a, b) => a.localeCompare(b));
    }
  } catch (err) {
    console.warn('Failed to merge game tags to Supabase:', err);
  }
}

async function deleteTagFromSupabase(tagName) {
  try {
    if (!hasSupabaseStore()) return;

    const response = await fetch(buildSupabaseUrl({
      name: 'eq.' + tagName
    }, 'tags'), {
      method: 'DELETE',
      headers: getSupabaseHeaders()
    });

    if (!response.ok) {
      console.warn('Failed to delete tag from Supabase:', await response.text());
    }
  } catch (err) {
    console.warn('Error deleting tag from Supabase:', err);
  }
}

function deleteTagGlobally(tagName) {
  const tagLower = tagName.toLowerCase();
  if (tagLower === FEATURED_TAG.toLowerCase()) return;
  const idx = allTags.findIndex(t => t.toLowerCase() === tagLower);
  if (idx !== -1) allTags.splice(idx, 1);
  const sIdx = supabaseTags.findIndex(t => t.toLowerCase() === tagLower);
  if (sIdx !== -1) supabaseTags.splice(sIdx, 1);

  const removeFromDoc = (doc) => {
    doc.nodes.forEach((node) => {
      if (node.tags) node.tags = node.tags.filter(t => t.toLowerCase() !== tagLower);
    });
  };
  state.store.games.forEach((game) => removeFromDoc(game));
  removeFromDoc(state.doc);

  deleteTagFromSupabase(tagName).catch(err => console.warn('Failed to delete tag from Supabase:', err));

  renderTagPicker(getGameNode());
  scheduleRecoverySync();
}

const EMPTY_DOC = {
  updatedAt: '',
  nodes: [],
  links: []
};

const EMPTY_STORE = {
  _comment: STORE_COMMENT,
  updatedAt: '',
  games: []
};

const PLAY_PREVIEW_KEY = 'tgb-play-current-game';
const PAPER_BASE_WIDTH = 1224;
const PAPER_ASPECT_RATIO = 11 / 8.5;
const GRID_COLUMNS = 5;
const GRID_ROWS = 5;
const GAME_HOME_COL = 0;
const GAME_HOME_ROW = 0;
const AUTO_PLACE_GAP_X = 0;
const AUTO_PLACE_GAP_Y = 0;
const BOARD_PADDING = 0;
const MAJOR_GRID_SNAP_THRESHOLD = 54;
const LINK_INTERACTION_RADIUS = 28;
const LINK_LANE_OFFSET = 18;
const LINK_NODE_CLEARANCE = 10;
const LINK_CORNER_RADIUS = 16;
const NODE_PORT_OFFSET = 8;
const THREAD_LAYOUT_ENABLED = true;
const PHONE_DEVICE_WIDTH = 470;
const PHONE_STAGE_WIDTH = PHONE_DEVICE_WIDTH;
const PHONE_DEVICE_X = 0;
const PHONE_DEVICE_Y = 28;
const PHONE_STATUSBAR_HEIGHT = 60;
const PHONE_HEADER_HEIGHT = 102;
const PHONE_COMPOSER_HEIGHT = 84;
const PHONE_THREAD_SIDE_PADDING = 28;
const PHONE_THREAD_TOP_GAP = 28;
const PHONE_THREAD_BOTTOM_PADDING = 110;
const PHONE_ROW_GAP = 20;
const PHONE_BRANCH_GAP = 14;
const PHONE_MIN_DEVICE_HEIGHT = 980;
const PHONE_STENCIL_TRAY_GAP = 18;
const PHONE_STENCIL_TRAY_HEIGHT = 104;
const PHONE_ANYTIME_GAP = 86;
const PHONE_ANYTIME_ROW_GAP = 26;
const PHONE_ANYTIME_BOTTOM_PADDING = 72;
const PHONE_BUBBLE_MIN_WIDTH = 110;
const PHONE_BUBBLE_MAX_WIDTH = 258;
const STENCIL_DRAG_START_DISTANCE = 6;
const SINGLE_SHEET_SCROLL = true;
const STENCIL_SHORTCUTS = {
  stop: 'W',
  bubble: 'G',
  reply: 'P',
  button: 'B'
};

function normalizeSupabaseUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function sanitizeSupabaseConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const url = normalizeSupabaseUrl(source.url);
  const publishableKey = typeof source.publishableKey === 'string' && source.publishableKey.trim()
    ? source.publishableKey.trim()
    : (typeof source.anonKey === 'string' ? source.anonKey.trim() : '');
  const gamesTable = typeof source.gamesTable === 'string' && source.gamesTable.trim()
    ? source.gamesTable.trim()
    : DEFAULT_SUPABASE_GAMES_TABLE;
  return {
    enabled: source.enabled !== false && !!url && !!publishableKey,
    url,
    publishableKey,
    gamesTable
  };
}

function persistSupabaseConfig(config) {
  try {
    if (config && config.enabled) {
      localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } else {
      localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
    }
  } catch (error) {
  }
}

function readSupabaseConfig() {
  const inlineConfigExists = !!(window.TGB_SUPABASE_CONFIG && typeof window.TGB_SUPABASE_CONFIG === 'object');
  if (inlineConfigExists) {
    const inlineConfig = sanitizeSupabaseConfig(window.TGB_SUPABASE_CONFIG);
    persistSupabaseConfig(inlineConfig);
    return inlineConfig;
  }

  try {
    const storedConfig = JSON.parse(localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY) || 'null');
    return sanitizeSupabaseConfig(storedConfig);
  } catch (error) {
    return sanitizeSupabaseConfig(null);
  }
}

function hasSupabaseStore() {
  return !!supabaseConfig.enabled;
}

function buildSupabaseUrl(params = null, tableName = supabaseConfig.gamesTable) {
  if (!hasSupabaseStore()) return '';
  const table = typeof tableName === 'string' && tableName.trim()
    ? tableName.trim()
    : supabaseConfig.gamesTable;
  const url = new URL('/rest/v1/' + encodeURIComponent(table), supabaseConfig.url + '/');
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function getSupabaseHeaders(extraHeaders = {}) {
  if (!hasSupabaseStore()) return { ...extraHeaders };
  return {
    apikey: supabaseConfig.publishableKey,
    Authorization: 'Bearer ' + supabaseConfig.publishableKey,
    ...extraHeaders
  };
}

function buildSupabaseAuthUrl(pathName) {
  return new URL('/auth/v1/' + String(pathName || '').replace(/^\/+/, ''), supabaseConfig.url + '/').toString();
}

function normalizeAuthEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isAllowedBuilderEmail(email) {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) return false;
  if (!BUILDER_ALLOWED_EMAILS.length) return true;
  return BUILDER_ALLOWED_EMAILS.map(normalizeAuthEmail).includes(normalizedEmail);
}

function readBuilderAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(BUILDER_AUTH_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function persistBuilderAuthSession(session) {
  try {
    if (session) localStorage.setItem(BUILDER_AUTH_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(BUILDER_AUTH_STORAGE_KEY);
  } catch (error) {
  }
}

function clearBuilderAuthSession() {
  persistBuilderAuthSession(null);
}

function getBuilderSessionExpiryTime(session) {
  if (!session || typeof session.expires_at !== 'number') return 0;
  return session.expires_at * 1000;
}

function setBuilderAuthStatus(message, state = '') {
  if (!builderAuthStatus) return;
  builderAuthStatus.textContent = message || '';
  if (state) builderAuthStatus.dataset.state = state;
  else builderAuthStatus.removeAttribute('data-state');
}

function setBuilderAuthActionBusy(busy) {
  const isBusy = !!busy;
  if (builderAuthSubmitBtn) builderAuthSubmitBtn.disabled = isBusy;
  if (builderAuthResetBtn) builderAuthResetBtn.disabled = isBusy;
  if (builderAuthRequestBtn) builderAuthRequestBtn.disabled = isBusy;
}

function getBuilderAuthResetRedirectUrl() {
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch (error) {
    return window.location.href;
  }
}

async function readSupabaseAuthError(response, fallbackMessage) {
  const fallback = fallbackMessage || 'Request failed.';
  const normalizeMessage = (value) => {
    const message = typeof value === 'string' ? value.trim() : '';
    if (!message) return fallback;
    if (/email rate limit exceeded/i.test(message)) {
      return 'Too many reset emails were sent recently. Wait a bit, then try again.';
    }
    return message;
  };

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const payload = JSON.parse(text);
      return normalizeMessage(payload.msg || payload.message || payload.error_description || payload.error || fallback);
    } catch (parseError) {
      return normalizeMessage(text);
    }
  } catch (error) {
    return fallback;
  }
}

function setBuilderAuthLocked(locked) {
  document.body.classList.toggle('builder-auth-locked', !!locked);
  document.body.classList.toggle('builder-auth-ready', !locked);
  if (builderAuthScreen) builderAuthScreen.hidden = !locked;
}

async function fetchBuilderAuthUser(accessToken) {
  const response = await fetch(buildSupabaseAuthUrl('user'), {
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: 'Bearer ' + accessToken
    }
  });

  if (!response.ok) {
    throw new Error(await readSupabaseAuthError(response, 'Could not verify the current user.'));
  }

  return response.json();
}

async function refreshBuilderAuthSession(session) {
  if (!session || !session.refresh_token) return null;

  const response = await fetch(buildSupabaseAuthUrl('token?grant_type=refresh_token'), {
    method: 'POST',
    headers: {
      apikey: supabaseConfig.publishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });

  if (!response.ok) {
    throw new Error(await readSupabaseAuthError(response, 'Session refresh failed.'));
  }

  const payload = await response.json();
  const user = payload.user || await fetchBuilderAuthUser(payload.access_token);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || session.refresh_token,
    expires_at: payload.expires_at || Math.floor((Date.now() + ((payload.expires_in || 3600) * 1000)) / 1000),
    user
  };
}

async function signInToBuilder(email, password) {
  const response = await fetch(buildSupabaseAuthUrl('token?grant_type=password'), {
    method: 'POST',
    headers: {
      apikey: supabaseConfig.publishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await readSupabaseAuthError(response, 'Sign-in failed.'));
  }

  const payload = await response.json();
  const user = payload.user || await fetchBuilderAuthUser(payload.access_token);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || Math.floor((Date.now() + ((payload.expires_in || 3600) * 1000)) / 1000),
    user
  };
}

async function sendBuilderPasswordReset(email) {
  const response = await fetch(buildSupabaseAuthUrl('recover'), {
    method: 'POST',
    headers: {
      apikey: supabaseConfig.publishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      redirect_to: getBuilderAuthResetRedirectUrl()
    })
  });

  if (!response.ok) {
    throw new Error(await readSupabaseAuthError(response, 'Password reset failed.'));
  }
}

async function restoreBuilderAuthSession() {
  const storedSession = readBuilderAuthSession();
  if (!storedSession || !storedSession.access_token) return null;

  try {
    const expiresAt = getBuilderSessionExpiryTime(storedSession);
    let session = storedSession;
    if (!expiresAt || expiresAt <= (Date.now() + BUILDER_AUTH_REFRESH_BUFFER_MS)) {
      session = await refreshBuilderAuthSession(storedSession);
      persistBuilderAuthSession(session);
    } else if (!session.user || !session.user.email) {
      session.user = await fetchBuilderAuthUser(session.access_token);
      persistBuilderAuthSession(session);
    }

    if (!isAllowedBuilderEmail(session.user && session.user.email)) {
      clearBuilderAuthSession();
      throw new Error('This account is not authorized for the builder.');
    }

    return session;
  } catch (error) {
    clearBuilderAuthSession();
    throw error;
  }
}

async function unlockBuilderForSession(session) {
  persistBuilderAuthSession(session);
  setBuilderAuthLocked(false);
  if (builderAuthPasswordInput) builderAuthPasswordInput.value = '';
  setBuilderAuthStatus(session && session.user && session.user.email ? 'Signed in as ' + session.user.email : '', 'success');
  if (!builderHasInitialized) {
    builderHasInitialized = true;
    await initializeBuilder();
  }
}

async function ensureBuilderAccess() {
  if (!hasSupabaseStore()) {
    setBuilderAuthLocked(true);
    setBuilderAuthStatus('Builder auth is unavailable because Supabase is not configured.', 'error');
    if (builderAuthSubmitBtn) builderAuthSubmitBtn.disabled = true;
    return false;
  }

  try {
    const session = await restoreBuilderAuthSession();
    if (!session) {
      setBuilderAuthLocked(true);
      setBuilderAuthStatus('Sign in with an admin account to open the builder.');
      return false;
    }
    await unlockBuilderForSession(session);
    return true;
  } catch (error) {
    setBuilderAuthLocked(true);
    setBuilderAuthStatus(error instanceof Error ? error.message : String(error), 'error');
    return false;
  }
}

async function handleBuilderAuthSubmit(event) {
  event.preventDefault();
  if (!builderAuthEmailInput || !builderAuthPasswordInput || !builderAuthSubmitBtn) return;

  const email = builderAuthEmailInput.value.trim();
  const password = builderAuthPasswordInput.value;
  if (!email || !password) {
    setBuilderAuthStatus('Enter both email and password.', 'error');
    return;
  }

  setBuilderAuthActionBusy(true);
  setBuilderAuthStatus('Signing in...');

  try {
    const session = await signInToBuilder(email, password);
    if (!isAllowedBuilderEmail(session.user && session.user.email)) {
      throw new Error('This account is not authorized for the builder.');
    }
    await unlockBuilderForSession(session);
  } catch (error) {
    clearBuilderAuthSession();
    setBuilderAuthLocked(true);
    setBuilderAuthStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBuilderAuthActionBusy(false);
  }
}

async function handleBuilderPasswordReset() {
  if (!builderAuthEmailInput) return;
  const email = builderAuthEmailInput.value.trim();
  if (!email) {
    setBuilderAuthStatus('Enter your email first, then use reset password.', 'error');
    builderAuthEmailInput.focus();
    return;
  }

  setBuilderAuthActionBusy(true);
  setBuilderAuthStatus('Sending password reset email...');
  try {
    await sendBuilderPasswordReset(email);
    setBuilderAuthStatus('If that account exists, a reset link has been sent to ' + email + '.', 'success');
  } catch (error) {
    setBuilderAuthStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBuilderAuthActionBusy(false);
  }
}

function handleBuilderAccessRequest() {
  if (!builderAuthEmailInput) return;
  const email = builderAuthEmailInput.value.trim();
  if (!email) {
    setBuilderAuthStatus('Enter your email first, then request access.', 'error');
    builderAuthEmailInput.focus();
    return;
  }

  const recipient = BUILDER_ACCESS_REQUEST_EMAIL.trim();
  if (!recipient) {
    setBuilderAuthStatus('Access requests are not configured yet.', 'error');
    return;
  }

  const subject = 'Builder access request';
  const body = [
    'Please grant builder access for:',
    email,
    '',
    'Page:',
    window.location.href
  ].join('\n');
  window.location.href = 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  setBuilderAuthStatus('Opened an access request email for ' + recipient + '.', 'success');
}

async function handleBuilderSignOut() {
  const session = readBuilderAuthSession();
  clearBuilderAuthSession();
  setBuilderAuthLocked(true);
  setBuilderAuthStatus('Signed out. Sign in to reopen the builder.');
  if (builderAuthEmailInput) builderAuthEmailInput.focus();

  if (session && session.access_token) {
    try {
      await fetch(buildSupabaseAuthUrl('logout'), {
        method: 'POST',
        headers: {
          apikey: supabaseConfig.publishableKey,
          Authorization: 'Bearer ' + session.access_token
        }
      });
    } catch (error) {
    }
  }
}

async function bootstrapBuilder() {
  await ensureBuilderAccess();
}

function buildStoreFromGames(games = []) {
  const store = normalizeStore({ games });
  store.updatedAt = getStoreUpdatedTime(store) ? new Date(getStoreUpdatedTime(store)).toISOString() : '';
  return store;
}

function normalizeArchivedFlag(value) {
  if (value === true) return ARCHIVED_GAME_VALUE;
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeErasedFlag(value) {
  if (value === true) return ERASED_GAME_VALUE;
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeFeaturedFlag(value) {
  if (value === true) return FEATURED_GAME_VALUE;
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function getFeaturedFlagFromNodes(nodes = []) {
  if (!Array.isArray(nodes)) return '';
  const gameNode = nodes.find((node) => node && node.type === 'game');
  return normalizeFeaturedFlag(gameNode && gameNode.featured) === FEATURED_GAME_VALUE ? FEATURED_GAME_VALUE : '';
}

function applyFeaturedFlagToNodes(nodes = [], featuredValue = '') {
  if (!Array.isArray(nodes)) return [];
  const normalizedFeatured = normalizeFeaturedFlag(featuredValue) === FEATURED_GAME_VALUE ? FEATURED_GAME_VALUE : '';
  return nodes.map((node) => {
    if (!node || node.type !== 'game') return node;
    return {
      ...node,
      featured: normalizedFeatured
    };
  });
}

function setGameFeaturedState(game, featuredValue = '') {
  if (!game || typeof game !== 'object') return game;
  const normalizedFeatured = normalizeFeaturedFlag(featuredValue) === FEATURED_GAME_VALUE ? FEATURED_GAME_VALUE : '';
  return normalizeSavedGame({
    ...game,
    featured: normalizedFeatured,
    nodes: applyFeaturedFlagToNodes(Array.isArray(game.nodes) ? game.nodes : [], normalizedFeatured)
  }, 0);
}

function getMissingGamesColumnName(errorMessage = '') {
  const message = String(errorMessage || '');
  const match = message.match(/column\s+games\.([a-z_]+)\s+does\s+not\s+exist/i);
  return match ? String(match[1] || '').trim().toLowerCase() : '';
}

function markMissingGamesColumn(columnName = '') {
  if (columnName === 'featured' || columnName === 'city') {
    SUPABASE_GAMES_SCHEMA[columnName] = false;
  }
}

function buildGamesSelectColumns(columns = []) {
  return columns.filter((column) => {
    if (column === 'featured') return SUPABASE_GAMES_SCHEMA.featured;
    if (column === 'city') return SUPABASE_GAMES_SCHEMA.city;
    return true;
  }).join(',');
}

function serializeGameRow(game, index = 0) {
  const normalizedGame = normalizeSavedGame(game, index);
  const timestamp = normalizedGame.updatedAt || normalizedGame.createdAt || new Date().toISOString();
  const payload = {
    id: normalizedGame.id,
    name: normalizedGame.name || 'Untitled Game',
    primary_color: normalizedGame.primaryColor || null,
    secondary_color: normalizedGame.secondaryColor || null,
    archived: normalizedGame.archived || null,
    erased: normalizedGame.erased || null,
    nodes: applyFeaturedFlagToNodes(Array.isArray(normalizedGame.nodes) ? normalizedGame.nodes : [], normalizedGame.featured),
    links: Array.isArray(normalizedGame.links) ? normalizedGame.links : [],
    created_at: normalizedGame.createdAt || timestamp,
    updated_at: timestamp
  };
  if (SUPABASE_GAMES_SCHEMA.city) payload.city = normalizedGame.city || null;
  if (SUPABASE_GAMES_SCHEMA.featured) payload.featured = normalizedGame.featured || null;
  return payload;
}

function normalizeGameRow(row, index = 0) {
  const rowCity = row && typeof row.city === 'string' ? row.city : '';
  const rowNodes = Array.isArray(row && row.nodes) ? row.nodes : [];
  const nodes = rowCity
    ? rowNodes.map((node) => {
        if (!node || node.type !== 'game' || (typeof node.city === 'string' && node.city.trim())) return node;
        return {
          ...node,
          city: rowCity
        };
      })
    : rowNodes;
  const featured = row && typeof row.featured === 'string' ? row.featured : getFeaturedFlagFromNodes(nodes);
  return normalizeSavedGame({
    id: row && row.id,
    name: row && row.name,
    city: rowCity,
    createdAt: row && typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: row && typeof row.updated_at === 'string' ? row.updated_at : '',
    primaryColor: row && typeof row.primary_color === 'string' ? row.primary_color : '',
    secondaryColor: row && typeof row.secondary_color === 'string' ? row.secondary_color : '',
    featured,
    archived: row && typeof row.archived === 'string' ? row.archived : '',
    erased: row && typeof row.erased === 'string' ? row.erased : '',
    nodes,
    links: Array.isArray(row && row.links) ? row.links : []
  }, index);
}

async function fetchGameRowsFromSupabase(select = null) {
  const resolvedSelect = select || buildGamesSelectColumns([
    'id',
    'name',
    'city',
    'primary_color',
    'secondary_color',
    'featured',
    'archived',
    'erased',
    'nodes',
    'links',
    'created_at',
    'updated_at'
  ]);
  const response = await fetch(buildSupabaseUrl({
    select: resolvedSelect,
    order: 'name.asc'
  }), {
    cache: 'no-store',
    headers: getSupabaseHeaders({
      Accept: 'application/json'
    })
  });
  if (!response.ok) {
    const message = await response.text() || 'Supabase load failed';
    const missingColumn = getMissingGamesColumnName(message);
    if (missingColumn) {
      markMissingGamesColumn(missingColumn);
      const nextSelect = buildGamesSelectColumns((resolvedSelect || '').split(',').map((value) => value.trim()).filter(Boolean));
      if (nextSelect && nextSelect !== resolvedSelect) {
        return fetchGameRowsFromSupabase(nextSelect);
      }
    }
    throw new Error(message);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadStoreFromSupabase() {
  if (!hasSupabaseStore()) return null;

  try {
    const rows = await fetchGameRowsFromSupabase();
    return buildStoreFromGames(rows.map((row, index) => normalizeGameRow(row, index)));
  } catch (error) {
    return null;
  }
}

async function loadHeaderGameStoreFromSupabase() {
  if (!hasSupabaseStore()) return null;

  try {
    const rows = await fetchGameRowsFromSupabase(buildGamesSelectColumns([
      'id',
      'name',
      'city',
      'featured',
      'archived',
      'erased',
      'created_at',
      'updated_at'
    ]));
    return buildStoreFromGames(rows.map((row, index) => normalizeGameRow(row, index)));
  } catch (error) {
    return null;
  }
}

async function fetchGameRowFromSupabase(gameId, select = null) {
  const targetId = String(gameId || '').trim();
  if (!targetId || !hasSupabaseStore()) return null;
  const resolvedSelect = select || buildGamesSelectColumns([
    'id',
    'name',
    'city',
    'primary_color',
    'secondary_color',
    'featured',
    'archived',
    'erased',
    'nodes',
    'links',
    'created_at',
    'updated_at'
  ]);

  const response = await fetch(buildSupabaseUrl({
    select: resolvedSelect,
    id: 'eq.' + targetId,
    limit: '1'
  }), {
    cache: 'no-store',
    headers: getSupabaseHeaders({
      Accept: 'application/json'
    })
  });

  if (!response.ok) {
    const message = await response.text() || 'Supabase game load failed';
    const missingColumn = getMissingGamesColumnName(message);
    if (missingColumn) {
      markMissingGamesColumn(missingColumn);
      const nextSelect = buildGamesSelectColumns((resolvedSelect || '').split(',').map((value) => value.trim()).filter(Boolean));
      if (nextSelect && nextSelect !== resolvedSelect) {
        return fetchGameRowFromSupabase(targetId, nextSelect);
      }
    }
    throw new Error(message);
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function loadGameFromSupabase(gameId) {
  if (!hasSupabaseStore()) return null;

  try {
    const row = await fetchGameRowFromSupabase(gameId);
    if (!row) return null;
    const game = normalizeGameRow(row, 0);
    return normalizeErasedFlag(game && game.erased) === ERASED_GAME_VALUE ? null : game;
  } catch (error) {
    return null;
  }
}

async function setGameArchivedStateInSupabase(gameId, archivedValue) {
  const targetId = String(gameId || '').trim();
  if (!targetId || !hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.'),
      savedGame: null
    };
  }

  try {
    const response = await fetch(buildSupabaseUrl({
      id: 'eq.' + targetId
    }), {
      method: 'PATCH',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify({
        archived: archivedValue || null
      })
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase archive update failed.');
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('Supabase archive update did not update any rows.');
    }
    return {
      serverSaved: true,
      error: null,
      savedGame: normalizeGameRow(rows[0], 0)
    };
  } catch (error) {
    return { serverSaved: false, error, savedGame: null };
  }
}

async function setGameErasedStateInSupabase(gameId, erasedValue) {
  const targetId = String(gameId || '').trim();
  if (!targetId || !hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.'),
      savedGame: null
    };
  }

  try {
    const response = await fetch(buildSupabaseUrl({
      id: 'eq.' + targetId
    }), {
      method: 'PATCH',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify({
        erased: erasedValue || null
      })
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase erase update failed.');
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('Supabase erase update did not update any rows.');
    }
    return {
      serverSaved: true,
      error: null,
      savedGame: normalizeGameRow(rows[0], 0)
    };
  } catch (error) {
    return { serverSaved: false, error, savedGame: null };
  }
}

async function setCurrentFeaturedGameInSupabase(gameId, featuredValue) {
  const targetId = String(gameId || '').trim();
  if (!targetId || !hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.'),
      savedGame: null
    };
  }

  try {
    const rows = await fetchGameRowsFromSupabase();
    const games = rows.map((row, index) => normalizeGameRow(row, index));
    const updates = games
      .map((game) => {
        const nextFeatured = game.id === targetId ? featuredValue : '';
        const nextGame = setGameFeaturedState(game, nextFeatured);
        const beforeFeatured = normalizeFeaturedFlag(game.featured);
        const afterFeatured = normalizeFeaturedFlag(nextGame.featured);
        const beforeNodeFeatured = getFeaturedFlagFromNodes(game.nodes);
        const afterNodeFeatured = getFeaturedFlagFromNodes(nextGame.nodes);
        if (beforeFeatured === afterFeatured && beforeNodeFeatured === afterNodeFeatured) return null;
        return nextGame;
      })
      .filter(Boolean);

    if (!updates.length) {
      const existing = games.find((game) => game && game.id === targetId) || null;
      return {
        serverSaved: !!existing,
        error: existing ? null : new Error('No saved game was available to feature.'),
        savedGame: existing ? setGameFeaturedState(existing, featuredValue) : null
      };
    }

    const response = await fetch(buildSupabaseUrl({
      on_conflict: 'id'
    }), {
      method: 'POST',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      }),
      body: JSON.stringify(updates.map((game, index) => serializeGameRow(game, index)))
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase featured update failed.');
    }
    const savedRows = await response.json();
    if (!Array.isArray(savedRows) || !savedRows.length) {
      throw new Error('Supabase featured update did not update any rows.');
    }
    const savedGames = savedRows.map((row, index) => normalizeGameRow(row, index));
    const savedGame = savedGames.find((game) => game && game.id === targetId)
      || updates.find((game) => game && game.id === targetId)
      || null;
    return {
      serverSaved: true,
      error: null,
      savedGame
    };
  } catch (error) {
    return { serverSaved: false, error, savedGame: null };
  }
}

async function archiveGameInSupabase(gameId) {
  return setGameArchivedStateInSupabase(gameId, ARCHIVED_GAME_VALUE);
}

async function unarchiveGameInSupabase(gameId) {
  return setGameArchivedStateInSupabase(gameId, null);
}

async function eraseGameInSupabase(gameId) {
  return setGameErasedStateInSupabase(gameId, ERASED_GAME_VALUE);
}

async function createGameInSupabase(game) {
  if (!hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.'),
      savedGame: null
    };
  }

  try {
    const payload = serializeGameRow(game, 0);
    const response = await fetch(buildSupabaseUrl(), {
      method: 'POST',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify([payload])
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase duplicate save failed.');
    }
    const rows = await response.json();
    return {
      serverSaved: true,
      error: null,
      savedGame: normalizeGameRow(Array.isArray(rows) && rows.length ? rows[0] : payload, 0)
    };
  } catch (error) {
    return { serverSaved: false, error, savedGame: null };
  }
}

function usesSingleSheetScroll() {
  return SINGLE_SHEET_SCROLL;
}

function getViewportScrollPosition() {
  if (usesSingleSheetScroll()) {
    return {
      left: window.scrollX || window.pageXOffset || 0,
      top: window.scrollY || window.pageYOffset || 0
    };
  }
  return {
    left: viewport ? viewport.scrollLeft : 0,
    top: viewport ? viewport.scrollTop : 0
  };
}

function setViewportScrollPosition(left, top) {
  const nextLeft = Math.max(0, Math.round(left));
  const nextTop = Math.max(0, Math.round(top));
  if (usesSingleSheetScroll()) {
    window.scrollTo(nextLeft, nextTop);
    return;
  }
  if (!viewport) return;
  viewport.scrollLeft = nextLeft;
  viewport.scrollTop = nextTop;
}

function formatPhoneClock(date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch (error) {
    const hours24 = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return hours12 + ':' + minutes + ' ' + period;
  }
}

function updatePhoneStatusbarTime() {
  if (!phoneStatusbarTime) return;
  phoneStatusbarTime.textContent = formatPhoneClock(new Date());
}

function setHeaderOnlyMode(visible) {
  state.showHeaderOnlyMode = !!visible;
  document.body.classList.toggle('is-header-only', state.showHeaderOnlyMode);
}

function startPhoneClock() {
  if (!phoneStatusbarTime) return;
  if (phoneClockTimer) clearTimeout(phoneClockTimer);

  const tick = () => {
    updatePhoneStatusbarTime();
    const now = Date.now();
    const nextMinuteDelay = 60000 - (now % 60000) + 32;
    phoneClockTimer = window.setTimeout(tick, nextMinuteDelay);
  };

  tick();
}

function getBuilderPageMode() {
  try {
    return String(new URL(location.href).searchParams.get('mode') || '').trim().toLowerCase();
  } catch (error) {
    return '';
  }
}

// DOM cache / naming map for humans and AI:
// - builderAuth* = auth overlay controls
// - inspector* = game-level details panel
// - mainGrid = editor layout wrapper
// - addPanel + waypointLibrary* = add-node / waypoint library pane
// - .phone-shell is the structural workspace wrapper in HTML
// - viewport -> phoneStage -> phone = active phone workspace stack used in code
// - phoneThread* + phoneStartBtn = visible phone UI chrome
// - linkLayer + nodeLayer + stencilBar + outsideAnytimeLabel = workspace overlays
// - objectInspector* = selected-object details panel
const viewport = document.getElementById('viewport');
const phoneStage = document.getElementById('phoneStage');
const phone = document.getElementById('phone');
// GAME PICKER
const gamePickerSaveBtn = document.getElementById('gamePickerSaveBtn');
const linkLayer = document.getElementById('linkLayer');
const nodeLayer = document.getElementById('nodeLayer');
const gameshelf = document.getElementById('gameshelf');
const gameshelfPinned = document.getElementById('gameshelfPinned');
const gameshelfStream = document.getElementById('gameshelfStream');
const gameshelfList = document.getElementById('gameshelfList');
const phoneStatusbarTime = document.querySelector('.phone-statusbar-time');
const phoneStartBtn = document.getElementById('phoneStartBtn');
const phoneThreadMeta = document.getElementById('phoneThreadMeta');
const phoneThreadName = document.getElementById('phoneThreadName');
const phoneThreadAvatar = document.getElementById('phoneThreadAvatar');
const phoneThreadStatus = document.getElementById('phoneThreadStatus');
const outsideAnytimeLabel = document.getElementById('outsideAnytimeLabel');
const waypointLibraryList = document.getElementById('waypointLibraryList');
const waypointLibraryStatus = document.getElementById('waypointLibraryStatus');
const inspector = document.getElementById('inspector');
const objectInspector = document.getElementById('objectInspector');
const objectInspectorTitle = document.getElementById('objectInspectorTitle');
const objectDetailsCard = document.getElementById('objectDetailsCard');
const inspectorWindowBar = document.getElementById('inspectorWindowBar');
const inspectorWindowTitle = document.getElementById('inspectorWindowTitle');
const inspectorWindowTitleText = document.getElementById('inspectorWindowTitleText');
const inspectorWindowSubtitle = document.getElementById('inspectorWindowSubtitle');
const gameDetailsToggleBtn = document.getElementById('gameDetailsToggleBtn');
const inspectorStack = document.getElementById('inspectorStack');
const objectInspectorStack = document.getElementById('objectInspectorStack');
const objectInspectorContent = document.getElementById('objectInspectorContent');
const objectInspectorCopy = document.getElementById('objectInspectorCopy');
const mainGrid = document.getElementById('mainGrid');
const stencilBar = document.getElementById('stencilBar');
const addPanel = document.getElementById('addPanel');
const phoneShell = document.querySelector('.phone-shell');
const gamesPageHero = document.querySelector('.games-page-hero');
const gamePickerPlayBtn = document.getElementById('gamePickerPlayBtn');
const builderAuthScreen = document.getElementById('builderAuthScreen');
const builderAuthForm = document.getElementById('builderAuthForm');
const builderAuthEmailInput = document.getElementById('builderAuthEmail');
const builderAuthPasswordInput = document.getElementById('builderAuthPassword');
const builderAuthSubmitBtn = document.getElementById('builderAuthSubmitBtn');
const builderAuthResetBtn = document.getElementById('builderAuthResetBtn');
const builderAuthRequestBtn = document.getElementById('builderAuthRequestBtn');
const builderAuthStatus = document.getElementById('builderAuthStatus');
const builderSignOutBtn = document.getElementById('builderSignOutBtn');
const gamePickerSelect = document.getElementById('gamePickerSelect');
const builderTutorialPopover = document.getElementById('builderTutorialPopover');
const builderTutorialStepCount = document.getElementById('builderTutorialStepCount');
const builderTutorialTitle = document.getElementById('builderTutorialTitle');
const builderTutorialCopy = document.getElementById('builderTutorialCopy');
const builderTutorialBackBtn = document.getElementById('builderTutorialBackBtn');
const builderTutorialNextBtn = document.getElementById('builderTutorialNextBtn');
const builderTutorialCloseBtn = document.getElementById('builderTutorialCloseBtn');
const objectCard = document.getElementById('objectCard');
const inspectorContent = document.getElementById('inspectorContent');
const inspectorCopy = document.getElementById('inspectorCopy');
const titleField = document.getElementById('titleField');
const stopNameField = document.getElementById('stopNameField');
const taglineField = document.getElementById('taglineField');

const guideNameField = document.getElementById('guideNameField');
const gameLogoField = document.getElementById('gameLogoField');
const guideImageField = document.getElementById('guideImageField');
const guideBioField = document.getElementById('guideBioField');
const priceField = document.getElementById('priceField');
const cityField = document.getElementById('cityField');
const startingLocationField = document.getElementById('startingLocationField');
const primaryColorField = document.getElementById('primaryColorField');
const secondaryColorField = document.getElementById('secondaryColorField');
const quaternaryColorField = document.getElementById('quaternaryColorField');
const tagsField = document.getElementById('tagsField');
const teamsField = document.getElementById('teamsField');
const GAME_LOGO_ASSET_BASE_URL = 'https://the-game-bureau.github.io/the-game-bureau/assets/';
const GAME_LOGO_LOCAL_ASSET_MANIFEST_URL = '../assets/asset-manifest.json';
const GAME_LOGO_ASSET_MANIFEST_URL = `${GAME_LOGO_ASSET_BASE_URL}asset-manifest.json`;
const GAME_LOGO_ASSET_DEFAULT_MESSAGE = '';
const GAME_LOGO_ASSET_NOT_FOUND_MESSAGE = 'SAVE IMAGE TO ASSETS FOLDER (ONLINE) FIRST.';
const GAME_LOGO_ONLINE_ASSET_ERROR_MESSAGE = 'COULD NOT LOAD ONLINE ASSETS.';
const GUIDE_IMAGE_ASSET_DEFAULT_MESSAGE = 'CUT AND PASTE AN IMAGE URL OR CHOOSE AN UPLOADED ONE.';
const GUIDE_IMAGE_ASSET_NOT_FOUND_MESSAGE = GAME_LOGO_ASSET_NOT_FOUND_MESSAGE;
const GUIDE_IMAGE_ONLINE_ASSET_ERROR_MESSAGE = GAME_LOGO_ONLINE_ASSET_ERROR_MESSAGE;
const BUILDER_PAGE_MODE = getBuilderPageMode();
const BUILDER_TUTORIAL_MODE = 'tutorial';
const GAME_LOGO_FALLBACK_ASSET_NAMES = [
  '360insights_logo.jpg',
  'Arizona.gif',
  'army.png',
  'Army_West_Point_logo.svg',
  'Atlanta.gif',
  'atlas.png',
  'Carolina.gif',
  'Cleveland.gif',
  'dealer-tire.svg',
  'dealertire.jpeg',
  'Flag_of_Arizona.svg',
  'gbw.png',
  'GreenBay.gif',
  'guide_cardinals.jpg',
  'Jacksonville.gif',
  'lafayette.png',
  'LasVegas.gif',
  'logo.png',
  'Minnesota.gif',
  'NewOrleans.gif',
  'oswaldmugshot.webp',
  'Passport.avif',
  'passport.png',
  'saj.png',
  'scrappy.jpg',
  'shell-1971.png',
  'southern-miss.svg',
  'TampaBay.gif',
  'tgb.ico',
  'utsa.jpg'
];
const TEAM_FIELD_KEYS = Array.from({ length: 8 }, (_, index) => `team${String(index + 1).padStart(2, '0')}`);
const teamInputs = TEAM_FIELD_KEYS.map((key) => document.getElementById(key + 'Input'));
const descriptionField = document.getElementById('descriptionField');
const howToPlayField = document.getElementById('howToPlayField');
const nodeHowToPlayInput = document.getElementById('nodeHowToPlayInput');
const objectDescriptionField = document.getElementById('objectDescriptionField');
const ifThenField = document.getElementById('ifThenField');
const nodeTitleLabelText = document.getElementById('nodeTitleLabelText');
const nodeTitleInput = document.getElementById('nodeTitleInput');
const stopNameInput = document.getElementById('stopNameInput');
const objectStopNameField = document.getElementById('objectStopNameField');

function getNormalizedTeamValues(source) {
  if (!source || typeof source !== 'object') return TEAM_FIELD_KEYS.map(() => '');

  const namedValues = TEAM_FIELD_KEYS.map((key) => typeof source[key] === 'string' ? source[key] : '');
  const hasNamedValues = TEAM_FIELD_KEYS.some((key, index) =>
    Object.prototype.hasOwnProperty.call(source, key) || !!namedValues[index]
  );
  if (hasNamedValues) return namedValues;

  if (Array.isArray(source.teams)) {
    return TEAM_FIELD_KEYS.map((_, index) => typeof source.teams[index] === 'string' ? source.teams[index] : '');
  }

  return TEAM_FIELD_KEYS.map(() => '');
}

function getTeamFieldState(source) {
  const teamValues = getNormalizedTeamValues(source);
  const teamState = {
    teams: [...teamValues]
  };
  TEAM_FIELD_KEYS.forEach((key, index) => {
    teamState[key] = teamValues[index] || '';
  });
  return teamState;
}

function setTeamFieldValue(target, index, value) {
  if (!target || index < 0 || index >= TEAM_FIELD_KEYS.length) return;
  const nextValues = getNormalizedTeamValues(target);
  nextValues[index] = typeof value === 'string' ? value : '';
  target.teams = [...nextValues];
  TEAM_FIELD_KEYS.forEach((key, valueIndex) => {
    target[key] = nextValues[valueIndex] || '';
  });
}
const objectStopNameInput = document.getElementById('objectStopNameInput');
const objectWaypointGroupField = document.getElementById('objectWaypointGroupField');
const objectWaypointGroupButtons = Array.from(document.querySelectorAll('[data-waypoint-group-btn]'));
const nodeTaglineInput = document.getElementById('nodeTaglineInput');

const nodeGuideNameInput = document.getElementById('nodeGuideNameInput');
const nodeGuideBioInput = document.getElementById('nodeGuideBioInput');
const nodeGameLogoInput = document.getElementById('nodeGameLogoInput');
const gameLogoOnlinePickBtn = document.getElementById('gameLogoOnlinePickBtn');
const gameLogoOnlineMenu = document.getElementById('gameLogoOnlineMenu');
const gameLogoOnlineList = document.getElementById('gameLogoOnlineList');
const gameLogoAssetStatus = document.getElementById('gameLogoAssetStatus');
const gameLogoThumbBtn = document.getElementById('gameLogoThumbBtn');
const gameLogoThumbImage = document.getElementById('gameLogoThumbImage');
const gameLogoThumbPlaceholder = document.getElementById('gameLogoThumbPlaceholder');
const nodeGuideImageInput = document.getElementById('nodeGuideImageInput');
const guideImageOnlinePickBtn = document.getElementById('guideImageOnlinePickBtn');
const guideImageOnlineMenu = document.getElementById('guideImageOnlineMenu');
const guideImageOnlineList = document.getElementById('guideImageOnlineList');
const guideImageAssetStatus = document.getElementById('guideImageAssetStatus');
const guideImageThumbBtn = document.getElementById('guideImageThumbBtn');
const guideImageThumbImage = document.getElementById('guideImageThumbImage');
const guideImageThumbPlaceholder = document.getElementById('guideImageThumbPlaceholder');
const objectBubbleImageField = document.getElementById('objectBubbleImageField');
const objectBubbleImageInput = document.getElementById('objectBubbleImageInput');
const objectBubbleImageOnlinePickBtn = document.getElementById('objectBubbleImageOnlinePickBtn');
const objectBubbleImageOnlineMenu = document.getElementById('objectBubbleImageOnlineMenu');
const objectBubbleImageOnlineList = document.getElementById('objectBubbleImageOnlineList');
const objectBubbleImageAssetStatus = document.getElementById('objectBubbleImageAssetStatus');
const objectBubbleVideoField = document.getElementById('objectBubbleVideoField');
const objectBubbleVideoInput = document.getElementById('objectBubbleVideoInput');
const objectBubbleImageThumbBtn = document.getElementById('objectBubbleImageThumbBtn');
const objectBubbleImageThumbImage = document.getElementById('objectBubbleImageThumbImage');
const objectBubbleImageThumbPlaceholder = document.getElementById('objectBubbleImageThumbPlaceholder');
const nodePriceInput = document.getElementById('nodePriceInput');
const nodeCityInput = document.getElementById('nodeCityInput');
const nodeStartingLocationInput = document.getElementById('nodeStartingLocationInput');
const nodeStartingLocationMapBtn = document.getElementById('nodeStartingLocationMapBtn');
const primaryColorInput = document.getElementById('primaryColorInput');
const primaryColorPickerInput = document.getElementById('primaryColorPickerInput');
const secondaryColorInput = document.getElementById('secondaryColorInput');
const secondaryColorPickerInput = document.getElementById('secondaryColorPickerInput');
const tertiaryColorField = document.getElementById('tertiaryColorField');
const tertiaryColorInput = document.getElementById('tertiaryColorInput');
const tertiaryColorPickerInput = document.getElementById('tertiaryColorPickerInput');
const quaternaryColorInput = document.getElementById('quaternaryColorInput');
const quaternaryColorPickerInput = document.getElementById('quaternaryColorPickerInput');
const nodeTagPicker = document.getElementById('nodeTagPicker');
const nodeTagNewInput = document.getElementById('nodeTagNewInput');
const nodeTagAddBtn = document.getElementById('nodeTagAddBtn');
const nodeBodyLabel = document.getElementById('nodeBodyLabel');
const nodeBodyInfo = document.getElementById('nodeBodyInfo');
const nodeBodyInput = document.getElementById('nodeBodyInput');
const generateDescriptionBtn = descriptionField ? descriptionField.querySelector('[data-generate-description-btn]') : null;
const generateDescriptionStatus = descriptionField ? descriptionField.querySelector('[data-generate-description-status]') : null;
const nodeBodyAutocomplete = document.getElementById('nodeBodyAutocomplete');
const nodeBodyHtmlNote = document.getElementById('nodeBodyHtmlNote');
const objectBodyAnswerNote = document.getElementById('objectBodyAnswerNote');
const objectBodyHtmlNote = document.getElementById('objectBodyHtmlNote');
const objectBodyLabel = document.getElementById('objectBodyLabel');
const objectBodyInfo = document.getElementById('objectBodyInfo');
const objectBodyInput = document.getElementById('objectBodyInput');
const objectBodyAutocomplete = document.getElementById('objectBodyAutocomplete');
const objectBodyRequiredHint = document.getElementById('objectBodyRequiredHint');
const replyModeField = document.getElementById('replyModeField');
const replyModeNormalInput = document.getElementById('replyModeNormalInput');
const replyModeAnyAnswerInput = document.getElementById('replyModeAnyAnswerInput');
const replyModeAnytimeInput = document.getElementById('replyModeAnytimeInput');
const objectReplyModeField = document.getElementById('objectReplyModeField');
const objectReplyModeNormalInput = document.getElementById('objectReplyModeNormalInput');
const objectReplyModeAnyAnswerInput = document.getElementById('objectReplyModeAnyAnswerInput');
const objectReplyModeAnytimeInput = document.getElementById('objectReplyModeAnytimeInput');
const objectReplyTimingField = document.getElementById('objectReplyTimingField');
const objectReplyTimingInlineInput = document.getElementById('objectReplyTimingInlineInput');
const objectReplyTimingAnytimeInput = document.getElementById('objectReplyTimingAnytimeInput');

const varNameField = document.getElementById('varNameField');
const varNameInput = document.getElementById('varNameInput');
const varNameHint = document.getElementById('varNameHint');
const objectVarNameField = document.getElementById('objectVarNameField');
const objectVarNameInput = document.getElementById('objectVarNameInput');
const objectVarNameHint = document.getElementById('objectVarNameHint');
const varValuesField = document.getElementById('varValuesField');
const varValueInputs = [1, 2, 3, 4].map((index) => document.getElementById('varValue' + index));
const varCorrectRadios = [0, 1, 2, 3].map((index) => document.getElementById('varCorrect' + index));
const selectionId = document.getElementById('selectionId');
const objectSelectionId = document.getElementById('objectSelectionId');
const duplicateGameBtn = document.getElementById('duplicateGameBtn');
const featureGameBtn = document.getElementById('featureGameBtn');
const archiveGameBtn = document.getElementById('archiveGameBtn');
const duplicateGameStatus = document.getElementById('duplicateGameStatus');
const gameEraseBtn = document.getElementById('gameEraseBtn');
const deleteBtn = document.getElementById('deleteBtn');
const objectInsertBtn = document.getElementById('objectInsertBtn');
const objectDeleteBtn = document.getElementById('objectDeleteBtn');
const objectButtonNameField = document.getElementById('objectButtonNameField');
const objectButtonNameInput = document.getElementById('objectButtonNameInput');
const objectButtonTargetField = document.getElementById('objectButtonTargetField');
const objectButtonTargetInput = document.getElementById('objectButtonTargetInput');
const saveGameBtn = document.getElementById('saveGameBtn') || document.getElementById('playGameBtn');
const newPhoneBtn = document.getElementById('newPhoneBtn');
const refreshPageBtn = document.getElementById('refreshPageBtn');
const nodeContextMenu = document.getElementById('nodeContextMenu');
const duplicateNodeBtn = document.getElementById('duplicateNodeBtn');
const deleteNodeMenuBtn = document.getElementById('deleteNodeMenuBtn');
const waypointLibraryContextMenu = document.getElementById('waypointLibraryContextMenu');
const waypointLibraryOpenGameBtn = document.getElementById('waypointLibraryOpenGameBtn');
const gameEraseBackdrop = document.getElementById('gameEraseBackdrop');
const gameEraseConfirmBtn = document.getElementById('gameEraseConfirmBtn');
const gameArchiveConfirmBtn = document.getElementById('gameArchiveConfirmBtn');
const gameEraseCancelBtn = document.getElementById('gameEraseCancelBtn');
const waypointEraseBackdrop = document.getElementById('waypointEraseBackdrop');
const waypointEraseOnlyBtn = document.getElementById('waypointEraseOnlyBtn');
const waypointEraseBundleBtn = document.getElementById('waypointEraseBundleBtn');
const waypointEraseCancelBtn = document.getElementById('waypointEraseCancelBtn');
const guideImageLightboxBackdrop = document.getElementById('guideImageLightboxBackdrop');
const guideImageLightboxImage = document.getElementById('guideImageLightboxImage');
const guideImageLightboxCloseBtn = document.getElementById('guideImageLightboxCloseBtn');
const guideInsertMenu = document.getElementById('guideInsertMenu');
const guideInsertRoot = document.getElementById('guideInsertRoot');
const guideInsertStoredInfoBtn = document.getElementById('guideInsertStoredInfoBtn');
const guideInsertLinkBtn = document.getElementById('guideInsertLinkBtn');
const guideInsertVariablePanel = document.getElementById('guideInsertVariablePanel');
const guideInsertVariableBackBtn = document.getElementById('guideInsertVariableBackBtn');
const guideInsertVariableList = document.getElementById('guideInsertVariableList');
const guideInsertLinkPanel = document.getElementById('guideInsertLinkPanel');
const guideInsertLinkBackBtn = document.getElementById('guideInsertLinkBackBtn');
const guideInsertLinkTextInput = document.getElementById('guideInsertLinkTextInput');
const guideInsertLinkAddressInput = document.getElementById('guideInsertLinkAddressInput');
const guideInsertLinkSubmitBtn = document.getElementById('guideInsertLinkSubmitBtn');
const guideInsertImageBtn = document.getElementById('guideInsertImageBtn');
const guideInsertImagePanel = document.getElementById('guideInsertImagePanel');
const guideInsertImageBackBtn = document.getElementById('guideInsertImageBackBtn');
const guideInsertImageAddressInput = document.getElementById('guideInsertImageAddressInput');
const guideInsertImageSubmitBtn = document.getElementById('guideInsertImageSubmitBtn');
const bubbleDropLine = document.createElement('div');
bubbleDropLine.className = 'bubble-drop-line';
bubbleDropLine.hidden = true;
if (phoneStage) phoneStage.appendChild(bubbleDropLine);

const nodeEls = new Map();

// Load tags from Supabase asynchronously
loadTagsFromSupabase().catch(err => console.warn('Failed to initialize tags:', err));

let phoneClockTimer = null;
let gameshelfAutoScrollFrame = 0;
let gameshelfAutoScrollLastTime = 0;
let gameshelfLoopHeight = 0;
let recoverySaveTimer = 0;
let duplicateGameFeedbackTimer = 0;
let archiveGameFeedbackTimer = 0;
const GAMESHELF_AUTO_SCROLL_SPEED = 22;
const GAMESHELF_MIN_RENDER_CARDS = 12;
const variableAutocomplete = {
  open: false,
  items: [],
  activeIndex: 0,
  tokenStart: -1,
  tokenEnd: -1
};

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const state = {
  store: cloneObj(EMPTY_STORE),
  headerGames: [],
  doc: cloneObj(EMPTY_DOC),
  currentGameId: null,
  cleanSnapshot: null,
  contextMenuNodeId: null,
  contextMenuLinkId: null,
  waypointLibraryContextEntryId: null,
  selectedId: null,
  selectedLinkId: null,
  dragNode: null,
  rotateNode: null,
  dockTargetId: null,
  panPhone: null,
  stencilPress: null,
  stencilDrag: null,
  waypointLibraryPress: null,
  waypointLibraryDrag: null,
  waypointLibrarySuppressClick: false,
  connectDrag: null,
  inspectorDrag: null,
  suspendRecoverySync: false,
  lastRecoverySnapshot: '',
  localOnlyChanges: false,
  inspectorPosition: null,
  hoverTargetId: null,
  suppressBackgroundClick: false,
  layoutMetrics: null,
  dropSlot: null,
  currentGameColors: null,
  nextNodeNumbers: createNodeIdCounters(),
  initialScrollResetDone: false,
  saveUiState: 'loading',
  showHeaderOnlyMode: true,
  gameDetailsCollapsed: false,
  objectInspectorVisible: false,
  duplicateGameActionBusy: false,
  duplicateGameFeedback: '',
  featureGameActionBusy: false,
  featureGameFeedback: '',
  archiveGameActionBusy: false,
  archiveGameFeedback: '',
  gameEraseDialogResolver: null,
  gameEraseDialogPreviousFocus: null,
  gameEraseActionBusy: false,
  waypointEraseDialogResolver: null,
  waypointEraseDialogPreviousFocus: null,
  waypointLibraryEntries: [],
  waypointLibraryLoading: false,
  waypointLibraryStatusText: '',
  waypointLibraryRefreshToken: 0,
  guideImageLightboxPreviousFocus: null,
  guideInsertMenuPreviousFocus: null,
  guideInsertSelectionStart: null,
  guideInsertSelectionEnd: null,
  builderTutorialActive: false,
  builderTutorialStarted: false,
  builderTutorialIndex: -1,
  builderTutorialTarget: null
};

function cloneObj(value) {
  return JSON.parse(JSON.stringify(value));
}

function getSnapSize() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--snap'), 10) || 12;
}

function getMinorGridSize() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-minor'), 10) || 36;
}

function getMajorGridSize() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-major'), 10) || 180;
}

function getPlacementGridOrigin() {
  const minor = getMinorGridSize();
  return {
    x: minor,
    y: minor
  };
}

function getLegacyPlacementGridOrigin() {
  return {
    x: 0,
    y: 0
  };
}

function normalizeGridAnchoredValue(value, axis = 'x') {
  const snapped = snap(Number(value) || 0);
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const legacyOrigin = getLegacyPlacementGridOrigin();
  const offset = axis === 'y' ? origin.y : origin.x;
  const legacyOffset = axis === 'y' ? legacyOrigin.y : legacyOrigin.x;
  const normalizedToOrigin = ((snapped - offset) % major + major) % major;
  if (normalizedToOrigin === 0) return snapped;
  const normalizedToLegacy = ((snapped - legacyOffset) % major + major) % major;
  if (legacyOffset !== offset && normalizedToLegacy === 0) return snapped - legacyOffset + offset;
  return snapped;
}

function getPhoneBaseSize() {
  if (THREAD_LAYOUT_ENABLED) {
    const stencilTrayExtra = shouldReserveStencilTraySpace()
      ? PHONE_STENCIL_TRAY_GAP + PHONE_STENCIL_TRAY_HEIGHT
      : 0;
    const metrics = state.layoutMetrics || {
      stageWidth: PHONE_STAGE_WIDTH,
      stageHeight: PHONE_DEVICE_Y + PHONE_MIN_DEVICE_HEIGHT + stencilTrayExtra + 28
    };
    return {
      width: metrics.stageWidth,
      height: metrics.stageHeight
    };
  }

  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const minWidth = origin.x + (major * GRID_COLUMNS);
  const minHeight = origin.y + (major * GRID_ROWS);
  const baseWidth = Math.max(minWidth, PAPER_BASE_WIDTH);
  const baseHeight = Math.max(minHeight, Math.round(PAPER_BASE_WIDTH * PAPER_ASPECT_RATIO));
  const baseColumns = Math.max(GRID_COLUMNS, Math.floor((baseWidth - origin.x) / major));
  const occupiedColumns = state.doc.nodes.reduce((maxColumns, node) => {
    if (!node) return maxColumns;
    const column = Math.max(0, Math.floor(((node.x + (node.width / 2)) - origin.x) / major));
    return Math.max(maxColumns, column + 2);
  }, 0);
  const width = Math.max(baseWidth, origin.x + (Math.max(baseColumns, occupiedColumns) * major));
  const height = baseHeight;
  return {
    width,
    height
  };
}

function getPhoneStageSize() {
  const base = getPhoneBaseSize();
  return {
    width: phoneStage.clientWidth || base.width,
    height: phoneStage.clientHeight || base.height
  };
}

function getPlacementGridColumns() {
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const width = getPhoneStageSize().width;
  return Math.max(1, Math.floor((width - origin.x) / major));
}

function getPlacementGridRows() {
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const height = getPhoneStageSize().height;
  return Math.max(1, Math.floor((height - origin.y) / major));
}

function getPlacementBounds(width, height) {
  const origin = getPlacementGridOrigin();
  const stageSize = getPhoneStageSize();
  const phoneWidth = stageSize.width;
  const phoneHeight = stageSize.height;
  return {
    minX: origin.x,
    minY: origin.y,
    maxX: Math.max(origin.x, phoneWidth - width - BOARD_PADDING),
    maxY: Math.max(origin.y, phoneHeight - height - BOARD_PADDING)
  };
}

function snap(value) {
  const size = getSnapSize();
  return Math.round(value / size) * size;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createNodeIdCounters() {
  return Object.keys(TYPE_CONFIG).reduce((counters, type) => {
    counters[type] = 1;
    return counters;
  }, {});
}

function usesNodeTitle(type) {
  return type === 'game' || type === 'stop' || type === 'button';
}

function normalizeWaypointTitle(value, fallback = '') {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized) return normalized;
  return String(fallback || '').trim().toUpperCase();
}

const WAYPOINT_GROUP_OPTIONS = ['A', 'B', 'C', 'D', 'E'];
const LEGACY_WAYPOINT_GROUP_MAP = {
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  '5': 'E'
};

function normalizeWaypointGroup(value) {
  const normalized = String(value || '').trim().toUpperCase();
  const mapped = LEGACY_WAYPOINT_GROUP_MAP[normalized] || normalized;
  return WAYPOINT_GROUP_OPTIONS.includes(mapped) ? mapped : '';
}

function getDefaultNodeTitle(type, id = '') {
  if (type === 'stop') {
    const parsed = parseTypedNodeId(id);
    if (parsed && parsed.type === 'stop' && Number.isFinite(parsed.number)) {
      return normalizeWaypointTitle('Waypoint ' + parsed.number);
    }
    const fallbackNumber = Math.max(1, (state.nextNodeNumbers && state.nextNodeNumbers.stop ? state.nextNodeNumbers.stop : 1) - 1);
    return normalizeWaypointTitle('Waypoint ' + fallbackNumber);
  }
  return usesNodeTitle(type) ? TYPE_CONFIG[type].title : '';
}

function formatNodeId(id) {
  const parsed = parseTypedNodeId(id);
  if (parsed && parsed.type === 'stop' && Number.isFinite(parsed.number)) {
    return 'WP-' + String(parsed.number).padStart(2, '0');
  }
  return String(id || '').trim().toUpperCase();
}

function getNodeMessagePreview(node) {
  if (!node || !isBubbleLikeType(node.type)) return '';
  if (node.type === 'reply') {
    const guessText = summarizeMessageText(node.body, 18);
    if (guessText) {
      return guessText;
    }
    const varName = normalizeVariableName(node.varName);
    if (varName) return varName;
    return 'Incoming message';
  }
  const body = summarizeMessageText(node.body, 18);
  if (!body) return '';
  return body;
}

function normalizeVariableName(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/^%+\s*/, '')
    .replace(/\s*%+$/, '')
    .trim();
}

function getRawAnytimePairId(node) {
  return String(node && node.anytimePairId || '').trim();
}

function isLegacyAnytimeReplyNode(node) {
  return !!node && node.type === 'reply' && !!node.anytime && !!getRawAnytimePairId(node);
}

function isLegacyAnytimeGuideNode(node) {
  return !!node && node.type === 'bubble' && !!node.anytime && !!getRawAnytimePairId(node);
}

function isInlineAnytimeReplyNode(node) {
  return !!node && node.type === 'reply' && !!node.anytime && !getRawAnytimePairId(node);
}

function isAnytimeReplyNode(node) {
  return isLegacyAnytimeReplyNode(node);
}

function isAnytimeGuideNode(node) {
  return isLegacyAnytimeGuideNode(node);
}

function isAnytimeNode(node) {
  return isLegacyAnytimeReplyNode(node) || isLegacyAnytimeGuideNode(node);
}

function getAnytimePairId(node) {
  return isAnytimeNode(node)
    ? getRawAnytimePairId(node)
    : '';
}

function normalizeNodeOrderIndex(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function getNodeConversationRank(node) {
  if (!node) return 99;
  if (node.type === 'game') return 0;
  if (isAnytimeNode(node)) return 2;
  return 1;
}

function compareConversationNodes(a, b, nodeIndex = null) {
  const aRank = getNodeConversationRank(a);
  const bRank = getNodeConversationRank(b);
  if (aRank !== bRank) return aRank - bRank;

  const aOrder = normalizeNodeOrderIndex(a && a.orderIndex);
  const bOrder = normalizeNodeOrderIndex(b && b.orderIndex);
  if (aOrder != null || bOrder != null) {
    if (aOrder == null) return 1;
    if (bOrder == null) return -1;
    if (aOrder !== bOrder) return aOrder - bOrder;
  }

  const yDiff = (Number(a && a.y) || 0) - (Number(b && b.y) || 0);
  if (Math.abs(yDiff) > 2) return yDiff;

  const xDiff = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
  if (Math.abs(xDiff) > 2) return xDiff;

  const indexMap = nodeIndex || new Map(state.doc.nodes.map((node, index) => [node.id, index]));
  return (indexMap.get(a && a.id) ?? 0) - (indexMap.get(b && b.id) ?? 0);
}

function assignSequentialOrderIndices(nodes) {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  [...nodes]
    .sort((a, b) => compareConversationNodes(a, b, nodeIndex))
    .forEach((node, index) => {
      node.orderIndex = (index + 1) * 100;
    });
}

function getSortedConversationNodesFromList(nodes, sourceNodes = null) {
  const safeNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  const baseNodes = Array.isArray(sourceNodes) ? sourceNodes.filter(Boolean) : safeNodes;
  const nodeIndex = new Map(baseNodes.map((node, index) => [node.id, index]));
  return [...safeNodes].sort((a, b) => compareConversationNodes(a, b, nodeIndex));
}

function getAnytimePairNodes(pairId) {
  const normalizedPairId = String(pairId || '').trim();
  if (!normalizedPairId) return [];
  return state.doc.nodes.filter((node) => getAnytimePairId(node) === normalizedPairId);
}

function getLockedAnytimePartner(node) {
  const pairId = getAnytimePairId(node);
  if (!pairId) return null;
  return getAnytimePairNodes(pairId).find((candidate) => candidate.id !== node.id) || null;
}

function isLockedAnytimePairLink(link) {
  if (!link) return false;
  const fromNode = getNode(link.from);
  const toNode = getNode(link.to);
  const fromPairId = getAnytimePairId(fromNode);
  const toPairId = getAnytimePairId(toNode);
  return isAnytimeReplyNode(fromNode)
    && isAnytimeGuideNode(toNode)
    && !!fromPairId
    && fromPairId === toPairId;
}

function getDeclaredVariableKeys(value) {
  const keys = [];
  String(value || '').replace(/%\s*([A-Za-z_]\w*)\s*%/g, function (_, key) {
    keys.push(key);
    return _;
  });
  return keys;
}

function getLegacyReplyVarName(raw) {
  const explicitName = normalizeVariableName(raw && raw.varName);
  if (explicitName) return explicitName;
  const keys = getDeclaredVariableKeys(raw && raw.body);
  return keys.length === 1 ? keys[0] : '';
}

function isVariableOnlyBody(value) {
  return /^%\s*([A-Za-z_]\w*)\s*%$/.test(String(value || '').trim());
}

const REPLY_VAR_STOP_WORDS = new Set([
  'a', 'an', 'and', 'answer', 'are', 'be', 'can', 'could', 'did', 'do', 'does',
  'enter', 'for', 'from', 'give', 'guess', 'how', 'i', 'if', 'in', 'input', 'is',
  'it', 'lets', 'me', 'message', 'my', 'of', 'or', 'our', 'player', 'please',
  'reply', 'response', 's', 'say', 'send', 'should', 'something', 'tell', 'text',
  'that', 'the', 'this', 'to', 'type', 'value', 'want', 'what', 'when', 'where',
  'which', 'who', 'why', 'would', 'you', 'your'
]);
const REPLY_VAR_GENERIC_NAMES = new Set([
  'answer', 'guess', 'input', 'message', 'player', 'reply', 'response', 'text', 'value'
]);

function sanitizeSuggestedVariableName(value) {
  let nextValue = String(value || '')
    .toLowerCase()
    .replace(/%\s*([A-Za-z_]\w*)\s*%/g, '$1')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!nextValue) return '';
  if (/^\d/.test(nextValue)) nextValue = 'value_' + nextValue;
  return nextValue;
}

function guessVariableNameFromPrompt(value) {
  const prompt = String(value || '')
    .toLowerCase()
    .replace(/%\s*([A-Za-z_]\w*)\s*%/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!prompt) return '';

  if (/\bfull name\b/.test(prompt)) return 'full_name';
  if (/\bfirst name\b/.test(prompt)) return 'first_name';
  if (/\blast name\b|\bsurname\b/.test(prompt)) return 'last_name';
  if (/\b(call you|your name|who are you)\b/.test(prompt)) return 'name';
  if (/\bphone number\b|\bmobile number\b|\bcell number\b/.test(prompt)) return 'phone_number';
  if (/\bemail address\b|\bemail\b|\be mail\b/.test(prompt)) return 'email';
  if (/\bbirthday\b|\bdate of birth\b/.test(prompt)) return 'birthday';
  if (/\bhow old are you\b|\bage\b/.test(prompt)) return 'age';

  const favoriteMatch = prompt.match(/\bfavorite\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})\b/);
  if (favoriteMatch) {
    return sanitizeSuggestedVariableName('favorite ' + favoriteMatch[1]);
  }

  const yourMatch = prompt.match(/\byour\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})\b/);
  if (yourMatch) {
    const candidate = sanitizeSuggestedVariableName(yourMatch[1]);
    if (candidate && !REPLY_VAR_GENERIC_NAMES.has(candidate)) return candidate;
  }

  const meaningful = prompt
    .split(' ')
    .filter(Boolean)
    .filter((token) => !REPLY_VAR_STOP_WORDS.has(token));

  for (let size = Math.min(2, meaningful.length); size >= 1; size -= 1) {
    const candidate = sanitizeSuggestedVariableName(meaningful.slice(-size).join('_'));
    if (candidate && !REPLY_VAR_GENERIC_NAMES.has(candidate)) return candidate;
  }

  return '';
}

function getIncomingNodes(nodeId) {
  return state.doc.links
    .filter((link) => link.to === nodeId)
    .map((link) => getNode(link.from))
    .filter(Boolean);
}

function findReplyPromptSourceNode(node, preferredSource = null) {
  if (!node || node.type !== 'reply') return null;

  const queue = [];
  const seen = new Set([node.id]);
  if (preferredSource && preferredSource.id !== node.id) queue.push(preferredSource);
  getIncomingNodes(node.id).forEach((incomingNode) => {
    if (!preferredSource || incomingNode.id !== preferredSource.id) queue.push(incomingNode);
  });

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) continue;
    seen.add(current.id);
    if (current.type === 'bubble' && String(current.body || '').trim()) return current;
    if (current.type !== 'reply') continue;
    getIncomingNodes(current.id).forEach((incomingNode) => {
      if (!seen.has(incomingNode.id)) queue.push(incomingNode);
    });
  }

  return null;
}

function getUsedReplyVariableNames(ignoreNodeId = null) {
  const usedNames = new Set();
  state.doc.nodes.forEach((node) => {
    if (!node || node.type !== 'reply' || node.id === ignoreNodeId) return;
    const varName = normalizeVariableName(node.varName);
    if (varName) usedNames.add(varName.toLowerCase());
  });
  return usedNames;
}

function makeUniqueReplyVariableName(baseName, ignoreNodeId = null) {
  const sanitizedBase = sanitizeSuggestedVariableName(baseName) || 'reply';
  const usedNames = getUsedReplyVariableNames(ignoreNodeId);
  if (!usedNames.has(sanitizedBase.toLowerCase())) return sanitizedBase;

  let counter = 2;
  let candidate = sanitizedBase + '-' + counter;
  while (usedNames.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = sanitizedBase + '-' + counter;
  }
  return candidate;
}

function refreshVarNameHint() {
  if (!objectVarNameHint || !objectVarNameInput) return;
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'reply') { objectVarNameHint.hidden = true; return; }
  const name = normalizeVariableName(objectVarNameInput.value);
  let msg = '';
  if (!name) {
    msg = 'Required.';
  } else {
    const usedNames = getUsedReplyVariableNames(node.id);
    if (usedNames.has(name.toLowerCase())) msg = 'Already used in this game.';
  }
  objectVarNameHint.textContent = msg;
  objectVarNameHint.hidden = !msg;
  objectVarNameInput.classList.toggle('is-invalid', !!msg);
}

function refreshReplyBodyHint() {
  if (!objectBodyRequiredHint || !objectBodyInput) return;
  const node = getNode(state.selectedId);
  const requiresBody = !!node && node.type === 'reply' && !node.acceptAny;
  const message = requiresBody && !String(objectBodyInput.value || '').trim()
    ? 'Required.'
    : '';
  objectBodyRequiredHint.textContent = message;
  objectBodyRequiredHint.hidden = !message;
  objectBodyInput.classList.toggle('is-invalid', !!message);
}

function getReplyValidationIssue(node) {
  if (!node || node.type !== 'reply') return null;
  if (!normalizeVariableName(node.varName)) {
    return {
      nodeId: node.id,
      field: 'varName',
      message: 'Each PLAYER MSG needs a Message Name.'
    };
  }
  if (!node.acceptAny && !String(node.body || '').trim()) {
    return {
      nodeId: node.id,
      field: 'body',
      message: 'Each PLAYER MSG needs at least 1 character in Player Message.'
    };
  }
  return null;
}

function getFirstReplyValidationIssue() {
  const replyNodes = getSortedConversationNodesFromList(
    state.doc.nodes.filter((node) => node && node.type === 'reply'),
    state.doc.nodes
  );
  for (const node of replyNodes) {
    const issue = getReplyValidationIssue(node);
    if (issue) return issue;
  }
  return null;
}

function focusReplyValidationIssue(issue) {
  if (!issue || !issue.nodeId) return;
  selectNode(issue.nodeId);
  renderAll();
  requestAnimationFrame(() => {
    const target = issue.field === 'varName'
      ? objectVarNameInput
      : issue.field === 'timing'
        ? (objectReplyTimingAnytimeInput || objectReplyTimingInlineInput)
        : objectBodyInput;
    if (!target || target.disabled || typeof target.focus !== 'function') return;
    try {
      target.focus({ preventScroll: true });
    } catch (error) {
      target.focus();
    }
  });
}

function validateReplyNodes(options = {}) {
  const issue = getFirstReplyValidationIssue() || getFirstAnytimeWaypointValidationIssue();
  if (!issue) return null;
  focusReplyValidationIssue(issue);
  if (options.showAlert !== false) window.alert(issue.message);
  setSaveStatus('unsaved', 'Finish PLAYER MSG details');
  return issue;
}

function getFirstAnytimeWaypointValidationIssue() {
  const waypointGroups = getConversationWaypointGroups();
  for (const group of waypointGroups) {
    if (!group || !group.stop) continue;
    const anytimeReplies = getInlineAnytimeRepliesInWaypointGroup(group);
    const stopTitle = normalizeWaypointTitle(group.stop.title, TYPE_CONFIG.stop.title);
    const firstReply = getWaypointRepliesInGroup(group)[0] || null;
    if (anytimeReplies.length && firstReply && firstReply.id !== anytimeReplies[0].id) {
      return {
        nodeId: anytimeReplies[0].id,
        field: 'timing',
        message: `${stopTitle} must use ANYTIME on the first PLAYER MSG in that WAYPOINT.`
      };
    }
    if (anytimeReplies.length <= 1) continue;
    return {
      nodeId: anytimeReplies[1].id,
      field: 'timing',
      message: `${stopTitle} has more than one ANYTIME PLAYER MSG.`
    };
  }
  return null;
}

function canEnableInlineAnytimeForReply(replyNode, options = {}) {
  if (!replyNode || replyNode.type !== 'reply') return false;
  const waypointGroup = getWaypointConversationGroupForNode(replyNode.id);
  if (!waypointGroup || !waypointGroup.stop) {
    if (options.showAlert !== false) {
      window.alert('ANYTIME PLAYER MSG must live inside a WAYPOINT.');
    }
    return false;
  }
  const existingReplies = getInlineAnytimeRepliesInWaypointGroup(waypointGroup)
    .filter((node) => node.id !== replyNode.id);
  if (existingReplies.length) {
    if (options.showAlert !== false) {
      const stopTitle = normalizeWaypointTitle(waypointGroup.stop.title, TYPE_CONFIG.stop.title);
      window.alert(`${stopTitle} already has an ANYTIME PLAYER MSG. A WAYPOINT can only have one.`);
    }
    return false;
  }
  const firstReply = getWaypointRepliesInGroup(waypointGroup)[0] || null;
  if (firstReply && firstReply.id !== replyNode.id) {
    if (options.showAlert !== false) {
      const stopTitle = normalizeWaypointTitle(waypointGroup.stop.title, TYPE_CONFIG.stop.title);
      window.alert(`${stopTitle} can only use ANYTIME on the first PLAYER MSG in that WAYPOINT.`);
    }
    return false;
  }
  return true;
}

function buildBestGuessReplyVariableName(node, preferredSource = null) {
  const promptSource = findReplyPromptSourceNode(node, preferredSource);
  const baseName = promptSource ? guessVariableNameFromPrompt(promptSource.body) : '';
  return makeUniqueReplyVariableName(baseName || 'us_states', node ? node.id : null);
}

function ensureReplyVarName(node, preferredSource = null) {
  if (!node || node.type !== 'reply') return;
  if (normalizeVariableName(node.varName)) return;
  node.varName = buildBestGuessReplyVariableName(node, preferredSource);
}

function getNodeDisplayTitle(node) {
  if (!node) return '';
  if (THREAD_LAYOUT_ENABLED) return getPhonePrimaryText(node);
  const title = usesNodeTitle(node.type)
    ? String(node.title || '').trim()
    : getNodeMessagePreview(node);
  return node.type === 'reply' ? title.toUpperCase() : title;
}

function setGenerateDescriptionStatus(message = '') {
  if (!generateDescriptionStatus) return;
  const text = String(message || '').trim();
  generateDescriptionStatus.textContent = text;
  generateDescriptionStatus.hidden = !text;
}

function buildLocalGameDescription(gameNode) {
  const title = String(gameNode && gameNode.title || '').trim() || 'YOUR GAME';
  const city = String(gameNode && gameNode.city || '').trim();
  const cityClause = city
    ? `across the streets of ${city}`
    : 'across city streets';
  return `${title} is a scavenger hunt and escape room style adventure played ${cityClause}. Players follow clues, solve puzzles, and unlock waypoint after waypoint as the city becomes the game board. Each stop reveals the next piece of the mystery and pushes the team deeper into the story.`;
}

function getNodeKicker(node) {
  if (!node) return '';
  if (node.type === 'bubble' && node.kind) {
    return 'GUIDE ' + node.kind.toUpperCase();
  }
  return TYPE_CONFIG[node.type]?.kicker || '';
}

function getNodeAccessibleLabel(node) {
  const title = getNodeDisplayTitle(node);
  return title || getNodeKicker(node) || 'object';
}

function parseTypedNodeId(rawId) {
  const normalizedId = String(rawId || '').trim().toLowerCase();
  const match = /^([a-z]{2})-(\d+)$/.exec(normalizedId);
  if (!match) return null;
  const type = NODE_TYPE_BY_PREFIX[match[1]];
  if (!type) return null;
  return {
    id: normalizedId,
    type,
    number: Number(match[2])
  };
}

function makeId(type = 'stop', counters = state.nextNodeNumbers, usedIds = null) {
  const nodeType = TYPE_CONFIG[type] ? type : 'stop';
  if (!counters[nodeType]) counters[nodeType] = 1;

  let id = '';
  do {
    id = NODE_ID_PREFIX[nodeType] + '-' + String(counters[nodeType]).padStart(2, '0');
    counters[nodeType] += 1;
  } while (
    usedIds
      ? usedIds.has(id)
      : state.doc.nodes.some((node) => node.id === id)
  );

  if (usedIds) usedIds.add(id);
  return id;
}

function makeGameId() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function makeUniqueGameId() {
  const knownIds = new Set([
    ...state.store.games.map((g) => g && g.id),
    ...(state.headerGames || []).map((g) => g && g.id)
  ].filter(Boolean));
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = makeGameId();
    if (knownIds.has(candidate)) continue;
    if (hasSupabaseStore()) {
      try {
        const existing = await fetchGameRowFromSupabase(candidate, 'id');
        if (existing) continue;
      } catch (e) { /* treat as available */ }
    }
    return candidate;
  }
  // Fallback: shouldn't happen with 90000 possibilities
  return makeGameId();
}

function makeAnytimePairId() {
  return 'anytime-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function getVideoEmbedSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  // YouTube: youtu.be/ID or youtube.com/watch?v=ID or youtube.com/shorts/ID
  const ytShort = s.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
  if (ytShort) return { type: 'iframe', src: 'https://www.youtube.com/embed/' + ytShort[1] };
  const ytWatch = s.match(/youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)([A-Za-z0-9_-]+)/);
  if (ytWatch) return { type: 'iframe', src: 'https://www.youtube.com/embed/' + ytWatch[1] };
  // Vimeo: vimeo.com/ID
  const vimeo = s.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type: 'iframe', src: 'https://player.vimeo.com/video/' + vimeo[1] };
  // Direct video file
  return { type: 'video', src: s };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeMessageHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const attrValue = String(attr.value || '');
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attrValue)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

function htmlMessageToPlainText(value) {
  const source = String(value || '')
    .replace(/<\s*\/\s*br\s*>/gi, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|tr|section|article)>/gi, '\n');
  const template = document.createElement('template');
  template.innerHTML = source;
  return String(template.content.textContent || '')
    .replace(/\u00a0/g, ' ');
}

function summarizeMessageText(value, maxLength = 120) {
  const normalized = htmlMessageToPlainText(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength).trimEnd() + '...'
    : normalized;
}

function renderMessageHtml(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return escapeHtml(fallback).replace(/\n/g, '<br>');
  return sanitizeMessageHtml(
    raw
      .replace(/<\s*\/\s*br\s*>/gi, '<br>')
      .replace(/\n/g, '<br>')
  );
}

function getNode(id) {
  return state.doc.nodes.find((node) => node.id === id) || null;
}

function getLink(id) {
  return state.doc.links.find((link) => link.id === id) || null;
}

function clearSelection() {
  state.selectedId = null;
  state.selectedLinkId = null;
}

function selectNode(id) {
  state.selectedId = id;
  state.selectedLinkId = null;
}

function selectLink(id) {
  state.selectedId = null;
  state.selectedLinkId = id;
}

function hasGameNode() {
  return state.doc.nodes.some((node) => node.type === 'game');
}

function getGameNode() {
  return state.doc.nodes.find((node) => node && node.type === 'game') || null;
}

function canNodeAcceptIncoming(node) {
  return !!node && node.type !== 'game' && !isAnytimeReplyNode(node);
}

function canNodeConnectTo(fromNode, toNode) {
  if (!fromNode || !toNode || fromNode.id === toNode.id) return false;
  if (isAnytimeNode(fromNode) || isAnytimeNode(toNode)) {
    const fromPairId = getAnytimePairId(fromNode);
    const toPairId = getAnytimePairId(toNode);
    return isAnytimeReplyNode(fromNode)
      && isAnytimeGuideNode(toNode)
      && !!fromPairId
      && fromPairId === toPairId;
  }
  if (!canNodeAcceptIncoming(toNode)) return false;
  if (fromNode.type === 'game') return toNode.type === 'stop';
  return true;
}

function normalizeNodeRotation(rawRotation, type) {
  if (type !== 'bubble') return 0;
  const value = Number(rawRotation);
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(value / 45) * 45;
  return ((snapped % 360) + 360) % 360;
}

function getNodeRotation(node) {
  return node ? normalizeNodeRotation(node.rotation, node.type) : 0;
}

function getRotationFromPointer(node, clientX, clientY) {
  if (!node) return 0;
  const point = phonePointFromClient(clientX, clientY);
  const centerX = node.x + (node.width / 2);
  const centerY = node.y + (node.height / 2);
  const angle = Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI);
  return normalizeNodeRotation(angle - 180, node.type);
}

function getOutgoingLinks(nodeId, links = state.doc.links) {
  return links.filter((link) => link.from === nodeId);
}

function getIncomingLinks(nodeId, links = state.doc.links) {
  return links.filter((link) => link.to === nodeId);
}

function summarizePhoneText(value, maxLength = 120) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength).trimEnd() + '...'
    : normalized;
}

let phoneTextMeasureContext = null;

function getPhoneTextMeasureContext() {
  if (phoneTextMeasureContext || typeof document === 'undefined') return phoneTextMeasureContext;
  const canvas = document.createElement('canvas');
  phoneTextMeasureContext = canvas.getContext('2d');
  if (phoneTextMeasureContext) {
    phoneTextMeasureContext.font = '400 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
  return phoneTextMeasureContext;
}

function measurePhoneTextWidth(text, fallbackCharWidth = 8.4) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const context = getPhoneTextMeasureContext();
  if (!context) return normalized.length * fallbackCharWidth;
  return Math.ceil(context.measureText(normalized).width);
}

function estimatePhoneBubbleContentWidth(text, basePadding = 36, fallbackCharWidth = 8.4) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const longestLineWidth = lines.reduce((max, line) => Math.max(max, measurePhoneTextWidth(line, fallbackCharWidth)), 0);
  if (!longestLineWidth) return basePadding + 44;
  return basePadding + longestLineWidth;
}

function estimateWrappedLineCount(text, availableWidth, fallbackCharWidth = 8.4) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const safeWidth = Math.max(24, availableWidth);
  const fullWidth = measurePhoneTextWidth(normalized, fallbackCharWidth);
  if (fullWidth <= safeWidth) return 1;
  const words = normalized.split(' ');
  if (words.length <= 1) {
    return Math.max(1, Math.ceil(fullWidth / safeWidth));
  }
  let lines = 1;
  let currentLine = '';
  words.forEach((word) => {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    if (!currentLine || measurePhoneTextWidth(candidate, fallbackCharWidth) <= safeWidth) {
      currentLine = candidate;
      return;
    }
    lines += 1;
    currentLine = word;
  });
  return lines;
}

function getPhonePrimaryText(node) {
  if (!node) return '';
  if (node.type === 'game' || node.type === 'stop' || node.type === 'button') {
    return String(node.title || TYPE_CONFIG[node.type].title || '').trim();
  }
  if (node.type === 'reply') {
    if (node.acceptAny) return 'ANY PLAYER MSG';
    return summarizeMessageText(node.body, 160);
  }
  return summarizeMessageText(node.body, 160);
}

function getPhoneSecondaryText(node) {
  if (!node) return '';
  if (node.type === 'game') {
    return summarizePhoneText(node.tagline || node.body, 140);
  }
  if (node.type === 'stop') {
    return '';
  }
  if (node.type === 'reply') {
    return '';
  }
  return node.anytime ? 'Paired anytime response' : '';
}

function isPhoneTextOnlyAnytimeReplyNode(node) {
  return !!THREAD_LAYOUT_ENABLED
    && !!node
    && node.type === 'reply'
    && (isInlineAnytimeReplyNode(node) || isAnytimeReplyNode(node));
}

function getPhoneBubbleSide(node) {
  if (!node) return 'center';
  if (node.type === 'reply') return 'right';
  if (node.type === 'stop') return 'left';
  if (node.type === 'bubble') return 'left';
  if (node.type === 'button') return 'center';
  return 'center';
}

function isConversationThreadNode(node) {
  return !!node
    && !isAnytimeNode(node)
    && (node.type === 'stop' || node.type === 'bubble' || node.type === 'reply' || node.type === 'button');
}

function getConversationWaypointGroups(excludeNodeId = null) {
  const threadNodes = getSortedConversationNodes(
    state.doc.nodes.filter((node) => node && node.id !== excludeNodeId && isConversationThreadNode(node))
  );
  const groups = [];
  let currentGroup = null;

  threadNodes.forEach((node) => {
    if (node.type === 'stop') {
      currentGroup = {
        stop: node,
        nodes: [node]
      };
      groups.push(currentGroup);
      return;
    }

    if (!currentGroup) {
      currentGroup = {
        stop: null,
        nodes: []
      };
      groups.push(currentGroup);
    }

    currentGroup.nodes.push(node);
  });

  return groups;
}

function getWaypointConversationGroupForNode(nodeId, excludeNodeId = null) {
  const targetId = String(nodeId || '').trim();
  if (!targetId) return null;
  return getConversationWaypointGroups(excludeNodeId)
    .find((group) => group && Array.isArray(group.nodes) && group.nodes.some((node) => node.id === targetId)) || null;
}

function getInlineAnytimeRepliesInWaypointGroup(group) {
  return group && Array.isArray(group.nodes)
    ? group.nodes.filter((node) => isInlineAnytimeReplyNode(node))
    : [];
}

function getWaypointRepliesInGroup(group) {
  return group && Array.isArray(group.nodes)
    ? group.nodes.filter((node) => node && node.type === 'reply')
    : [];
}

function isInlineAnytimeWaypointGroup(group) {
  return !!(group && group.stop && getInlineAnytimeRepliesInWaypointGroup(group).length);
}

function isInlineAnytimeWaypointNode(node) {
  if (!node || !node.id) return false;
  return isInlineAnytimeWaypointGroup(getWaypointConversationGroupForNode(node.id));
}

function isPhoneThreadNode(node) {
  return !!node
    && isConversationThreadNode(node)
    && !isInlineAnytimeWaypointNode(node);
}

function canReorderPhoneThreadNode(node) {
  return THREAD_LAYOUT_ENABLED && isPhoneThreadNode(node);
}

function getSortedConversationNodes(nodes) {
  const nodeIndex = new Map(state.doc.nodes.map((node, index) => [node.id, index]));
  return [...nodes].sort((a, b) => compareConversationNodes(a, b, nodeIndex));
}

function getSortedPhoneThreadNodes(excludeNodeId = null) {
  return getConversationWaypointGroups(excludeNodeId)
    .filter((group) => !isInlineAnytimeWaypointGroup(group))
    .flatMap((group) => group.nodes);
}

function getPhoneIncomingSourceId(node) {
  if (!node) return '';
  const incoming = getIncomingLinks(node.id)
    .filter((link) => {
      const sourceNode = getNode(link.from);
      return sourceNode && !isAnytimeNode(sourceNode);
    });
  return incoming.length === 1 ? incoming[0].from : '';
}

function buildPhoneRowsFromNodes(messageNodes = []) {
  const rows = [];

  for (let index = 0; index < messageNodes.length; index += 1) {
    const current = messageNodes[index];
    const next = messageNodes[index + 1];
    const currentSourceId = current && current.type === 'bubble' ? getPhoneIncomingSourceId(current) : '';
    const nextSourceId = next && next.type === 'bubble' ? getPhoneIncomingSourceId(next) : '';
    const canShareRow =
      !!current
      && !!next
      && current.type === 'bubble'
      && next.type === 'bubble'
      && !!currentSourceId
      && currentSourceId === nextSourceId;

    if (canShareRow) {
      rows.push([current, next]);
      index += 1;
      continue;
    }

    if (current) rows.push([current]);
  }

  return rows;
}

function getPhoneThreadRows(excludeNodeId = null) {
  return buildPhoneRowsFromNodes(getSortedPhoneThreadNodes(excludeNodeId));
}

function reorderPhoneThreadNode(nodeId, insertIndex) {
  const node = getNode(nodeId);
  if (!canReorderPhoneThreadNode(node)) return false;
  const orderedNodes = getSortedPhoneThreadNodes(nodeId);
  const nextIndex = clamp(Number(insertIndex) || 0, 0, orderedNodes.length);
  orderedNodes.splice(nextIndex, 0, node);
  orderedNodes.forEach((candidate, index) => {
    candidate.orderIndex = (index + 1) * 100;
  });
  return true;
}

function getPhoneBaseThreadTop() {
  return PHONE_DEVICE_Y + PHONE_STATUSBAR_HEIGHT + PHONE_HEADER_HEIGHT + PHONE_THREAD_TOP_GAP;
}

function getPhoneAnytimeProjectedRows(excludeNodeId = null) {
  return getPhoneProjectedRows(getPhoneAnytimeRows(excludeNodeId), getPhoneBaseThreadTop());
}

function getPhoneThreadTop(excludeNodeId = null) {
  const anytimeProjectedRows = getPhoneAnytimeProjectedRows(excludeNodeId);
  return anytimeProjectedRows.length
    ? anytimeProjectedRows[anytimeProjectedRows.length - 1].nextRowTop + PHONE_ROW_GAP
    : getPhoneBaseThreadTop();
}

function getPhoneRowMaxWidth(nodes, threadWidth) {
  const gap = nodes.length > 1 ? PHONE_BRANCH_GAP : 0;
  return nodes.length > 1
    ? Math.max(PHONE_BUBBLE_MIN_WIDTH, Math.floor((threadWidth - (gap * (nodes.length - 1))) / nodes.length))
    : nodes.some((node) => node.type === 'stop' || node.type === 'bubble' || node.type === 'reply' || node.type === 'button') ? threadWidth : PHONE_BUBBLE_MAX_WIDTH;
}

function getPhoneProjectedRows(rows, startY) {
  const threadWidth = PHONE_DEVICE_WIDTH - (PHONE_THREAD_SIDE_PADDING * 2);
  let y = startY;

  return rows.map((row) => {
    const nodes = row.filter(Boolean);
    const perNodeMaxWidth = getPhoneRowMaxWidth(nodes, threadWidth);
    const sizes = nodes.map((node) => getPhoneBubbleSize(node, perNodeMaxWidth));
    const rowHeight = sizes.reduce((maxHeight, size, i) => {
      const node = nodes[i];
      const effectiveHeight = (node.type === 'bubble' || node.type === 'reply' || node.type === 'button')
        ? Math.max(size.height, node.height || 0)
        : size.height;
      return Math.max(maxHeight, effectiveHeight);
    }, 0);
    const rowTop = Math.round(y);
    y += rowHeight + PHONE_ROW_GAP;
    return {
      nodes,
      rowTop,
      rowHeight,
      nextRowTop: Math.round(y)
    };
  });
}

function getPhoneRowDropSlots(projectedRows, startY) {
  const gapHalf = Math.round(PHONE_ROW_GAP / 2);
  const minLineY = PHONE_DEVICE_Y + PHONE_STATUSBAR_HEIGHT + PHONE_HEADER_HEIGHT + 10;
  let insertIndex = 0;
  const slots = [{
    index: 0,
    lineY: Math.max(minLineY, startY - gapHalf),
    previewY: startY,
    sortY: Math.max(minLineY, startY - gapHalf),
    insertIndex
  }];

  projectedRows.forEach((row, index) => {
    insertIndex += row.nodes.length;
    const lineY = Math.max(minLineY, row.nextRowTop - gapHalf);
    slots.push({
      index: index + 1,
      lineY,
      previewY: row.nextRowTop,
      sortY: lineY,
      insertIndex
    });
  });

  return slots;
}

function getPhoneProjectedThreadRows(excludeNodeId = null) {
  return getPhoneProjectedRows(getPhoneThreadRows(excludeNodeId), getPhoneThreadTop(excludeNodeId));
}

function getPhoneDropSlots(excludeNodeId = null) {
  return getPhoneRowDropSlots(getPhoneProjectedThreadRows(excludeNodeId), getPhoneThreadTop(excludeNodeId));
}

function getNearestPhoneDropSlot(pointerY, excludeNodeId = null) {
  const slots = getPhoneDropSlots(excludeNodeId);
  if (!slots.length) return null;
  return slots.reduce((nearest, slot) => {
    if (!nearest) return slot;
    return Math.abs(pointerY - slot.lineY) < Math.abs(pointerY - nearest.lineY) ? slot : nearest;
  }, null);
}

function showBubbleDropLine(slot) {
  if (!bubbleDropLine || !slot) return;
  const metrics = state.layoutMetrics || {
    threadLeft: PHONE_DEVICE_X + PHONE_THREAD_SIDE_PADDING,
    threadWidth: PHONE_DEVICE_WIDTH - (PHONE_THREAD_SIDE_PADDING * 2)
  };
  bubbleDropLine.hidden = false;
  bubbleDropLine.style.left = Math.round(metrics.threadLeft) + 'px';
  bubbleDropLine.style.top = Math.round(slot.lineY) + 'px';
  bubbleDropLine.style.width = Math.round(metrics.threadWidth) + 'px';
}

function hideBubbleDropLine() {
  if (!bubbleDropLine) return;
  bubbleDropLine.hidden = true;
  bubbleDropLine.style.left = '0px';
  bubbleDropLine.style.top = '0px';
  bubbleDropLine.style.width = '0px';
}

function getPhoneAnytimeRows() {
  const rows = [];
  const seenNodeIds = new Set();
  const sortedAnytimeNodes = getSortedConversationNodes(state.doc.nodes.filter((node) => isAnytimeNode(node)));

  sortedAnytimeNodes.forEach((node) => {
    if (!node || seenNodeIds.has(node.id)) return;
    const pairId = getAnytimePairId(node);
    if (pairId) {
      const pairNodes = getAnytimePairNodes(pairId)
        .filter(Boolean)
        .sort((a, b) => {
          const sideOrder = { left: 0, center: 1, right: 2 };
          return (sideOrder[getPhoneBubbleSide(a)] ?? 1) - (sideOrder[getPhoneBubbleSide(b)] ?? 1);
        });
      pairNodes.forEach((candidate) => seenNodeIds.add(candidate.id));
      rows.push(pairNodes);
      return;
    }
    seenNodeIds.add(node.id);
    rows.push([node]);
  });

  getConversationWaypointGroups()
    .filter((group) => isInlineAnytimeWaypointGroup(group))
    .forEach((group) => {
      buildPhoneRowsFromNodes(group.nodes).forEach((row) => rows.push(row));
    });

  return rows;
}

function estimatePhoneTextLines(text, width, horizontalPadding = 34) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  const availableWidth = Math.max(24, width - horizontalPadding);
  return normalized
    .split(/\n+/)
    .reduce((total, line) => total + Math.max(1, estimateWrappedLineCount(line, availableWidth)), 0);
}

function getPhoneBubbleSize(node, maxWidth = PHONE_BUBBLE_MAX_WIDTH) {
  // Image/video bubbles: 6px padding each side � bubble sizes to media's natural width
  if (node.type === 'bubble' && (node.kind === 'image' || node.kind === 'video')) {
    const natW = node._naturalImageWidth;
    const w = natW
      ? clamp(Math.round(natW + 12), PHONE_BUBBLE_MIN_WIDTH, Math.round(maxWidth || PHONE_BUBBLE_MAX_WIDTH))
      : Math.round(maxWidth || PHONE_BUBBLE_MAX_WIDTH);
    return { width: w, height: Math.max(38, node.height || 38) };
  }
  const isMessageBubble = node.type === 'bubble' || node.type === 'reply';
  const preferredWidths = {
    game: 254,
    stop: 248,
    bubble: 252,
    reply: 252,
    button: 248
  };
  const minWidths = {
    game: PHONE_BUBBLE_MIN_WIDTH,
    stop: 168,
    bubble: 78,
    reply: 78,
    button: 168
  };
  const primaryText = getPhonePrimaryText(node);
  const preferredWidth = isMessageBubble
    ? estimatePhoneBubbleContentWidth(primaryText, 28, 8.2)
    : (node.type === 'stop' || node.type === 'button')
      ? Math.round(maxWidth)
      : (preferredWidths[node.type] || PHONE_BUBBLE_MAX_WIDTH);
  const minWidth = minWidths[node.type] || PHONE_BUBBLE_MIN_WIDTH;
  const safeMaxWidth = Math.max(
    minWidth,
    (node.type === 'stop' || node.type === 'button' || isMessageBubble)
      ? Math.round(maxWidth)
      : Math.min(PHONE_BUBBLE_MAX_WIDTH, Math.round(maxWidth))
  );
  const width = clamp(Math.min(preferredWidth, safeMaxWidth), minWidth, safeMaxWidth);
  const textPadding = isMessageBubble ? 26 : (node.type === 'stop' || node.type === 'button') ? 70 : 34;
  const primaryLines = estimatePhoneTextLines(primaryText, width, textPadding);
  const secondaryLines = estimatePhoneTextLines(getPhoneSecondaryText(node), width, textPadding);
  const minHeights = {
    game: 88,
    stop: 58,
    bubble: 38,
    reply: 38,
    button: 52
  };
  const extraPrimaryLineHeights = {
    stop: 17,
    bubble: 16,
    reply: 16,
    button: 16
  };
  const extraSecondaryLineHeights = {
    stop: 0,
    bubble: 0,
    reply: 0,
    button: 0
  };
  const height = clamp(
    (minHeights[node.type] || 74)
      + Math.max(0, primaryLines - 1) * (extraPrimaryLineHeights[node.type] || 22)
      + secondaryLines * (extraSecondaryLineHeights[node.type] || 16),
    minHeights[node.type] || 74,
    220
  );
  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function updatePhoneChrome() {
  if (!phoneThreadName) return;
  const syncPhoneThreadMeta = (_clickable) => {};
  if (!hasGameNode()) {
    syncPhoneThreadMeta(false);
    phoneThreadName.textContent = 'Game Builder';
    if (phoneThreadAvatar) {
      phoneThreadAvatar.style.setProperty('--phone-thread-avatar-image', 'none');
      phoneThreadAvatar.dataset.hasImage = 'false';
    }
    if (phoneThreadStatus) phoneThreadStatus.textContent = '';
    if (phoneStartBtn) phoneStartBtn.style.background = '';
    if (phone) {
      phone.style.removeProperty('--game-primary');
      phone.style.removeProperty('--game-secondary');
      phone.style.removeProperty('--game-quaternary');
    }
    if (phoneStage) {
      phoneStage.style.removeProperty('--game-primary');
      phoneStage.style.removeProperty('--game-secondary');
      phoneStage.style.removeProperty('--game-tertiary');
      phoneStage.style.removeProperty('--game-quaternary');
    }
    if (addPanel) {
      addPanel.style.removeProperty('--game-primary');
      addPanel.style.removeProperty('--game-tertiary');
      addPanel.style.removeProperty('--game-quaternary');
    }
    if (inspector) {
      inspector.style.removeProperty('--game-primary');
      inspector.style.removeProperty('--game-tertiary');
      inspector.style.removeProperty('--game-quaternary');
    }
    if (objectInspector) {
      objectInspector.style.removeProperty('--game-primary');
      objectInspector.style.removeProperty('--game-tertiary');
      objectInspector.style.removeProperty('--game-quaternary');
    }
    return;
  }
  const gameNode = getGameNode();
  syncPhoneThreadMeta(!!gameNode);
  phoneThreadName.textContent = getDocName();
  if (phoneThreadAvatar) {
    const guideImageUrl = gameNode && gameNode.type === 'game'
      ? String(gameNode.guideImageUrl || '').trim()
      : '';
    const cssImage = guideImageUrl
      ? `url("${guideImageUrl.replace(/["\\]/g, '\\$&')}")`
      : 'none';
    phoneThreadAvatar.style.setProperty('--phone-thread-avatar-image', cssImage);
    phoneThreadAvatar.dataset.hasImage = guideImageUrl ? 'true' : 'false';
  }
  if (phoneThreadStatus) phoneThreadStatus.textContent = gameNode?.guideName || '';
  const { primaryColor, secondaryColor } = getCurrentGameColors();
  if (phoneStartBtn) {
    phoneStartBtn.style.background = primaryColor || '';
  }
  const tertiaryColor = getGameNode()?.tertiaryColor || getEffectiveTertiary(primaryColor, secondaryColor);
  const quaternaryColor = normalizeQuaternaryColorValue(
    getGameNode()?.quaternaryColor,
    getQuaternaryColorFallback(primaryColor, secondaryColor)
  );
  if (phone) {
    phone.style.setProperty('--game-primary', primaryColor || '');
    phone.style.setProperty('--game-secondary', secondaryColor || '');
    phone.style.setProperty('--game-quaternary', quaternaryColor || '');
  }
  if (phoneStage) {
    phoneStage.style.setProperty('--game-primary', primaryColor || '');
    phoneStage.style.setProperty('--game-secondary', secondaryColor || '');
    phoneStage.style.setProperty('--game-tertiary', tertiaryColor || '');
    phoneStage.style.setProperty('--game-quaternary', quaternaryColor || '');
  }
  if (addPanel) {
    addPanel.style.setProperty('--game-primary', primaryColor || '');
    addPanel.style.setProperty('--game-tertiary', tertiaryColor || '');
    addPanel.style.setProperty('--game-quaternary', quaternaryColor || '');
  }
  if (inspector) {
    inspector.style.setProperty('--game-primary', primaryColor || '');
    inspector.style.setProperty('--game-tertiary', tertiaryColor || '');
    inspector.style.setProperty('--game-quaternary', quaternaryColor || '');
  }
  if (objectInspector) {
    objectInspector.style.setProperty('--game-primary', primaryColor || '');
    objectInspector.style.setProperty('--game-tertiary', tertiaryColor || '');
    objectInspector.style.setProperty('--game-quaternary', quaternaryColor || '');
  }
}

function syncPhoneStartButton() {}

function openGameDetailsFromPhoneHeader() {
  const gameNode = getGameNode();
  if (!gameNode) return;
  selectNode(gameNode.id);
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
}

function applyPhoneThreadLayout() {
  if (!THREAD_LAYOUT_ENABLED) return;

  const threadLeft = PHONE_DEVICE_X + PHONE_THREAD_SIDE_PADDING;
  const threadWidth = PHONE_DEVICE_WIDTH - (PHONE_THREAD_SIDE_PADDING * 2);
  const threadTop = getPhoneBaseThreadTop();
  const startNode = getGameNode();
  if (startNode) {
    startNode.width = TYPE_CONFIG.game.width;
    startNode.height = TYPE_CONFIG.game.height;
  }
  const anytimeProjectedRows = getPhoneAnytimeProjectedRows();
  const mainThreadTop = anytimeProjectedRows.length
    ? anytimeProjectedRows[anytimeProjectedRows.length - 1].nextRowTop + PHONE_ROW_GAP
    : threadTop;
  const rows = getPhoneProjectedRows(getPhoneThreadRows(), mainThreadTop);

  function positionProjectedRows(projectedRows) {
    projectedRows.forEach((row) => {
      const nodes = row.nodes.filter(Boolean);
      if (!nodes.length) return;
      const gap = nodes.length > 1 ? PHONE_BRANCH_GAP : 0;
      const perNodeMaxWidth = getPhoneRowMaxWidth(nodes, threadWidth);
      const sizes = nodes.map((node) => getPhoneBubbleSize(node, perNodeMaxWidth));
      const effectiveHeights = sizes.map((size, i) => {
        const node = nodes[i];
        return (node.type === 'bubble' || node.type === 'reply' || node.type === 'button') ? Math.max(size.height, node.height || 0) : size.height;
      });

      if (nodes.length === 1) {
        const node = nodes[0];
        const size = sizes[0];
        const side = getPhoneBubbleSide(node);
        let x = threadLeft;
        if (side === 'right') x = threadLeft + threadWidth - size.width;
        if (side === 'center') x = threadLeft + ((threadWidth - size.width) / 2);
        node.x = Math.round(x);
        node.y = Math.round(row.rowTop);
        node.width = size.width;
        node.height = effectiveHeights[0];
        return;
      }

      const totalWidth = sizes.reduce((sum, size) => sum + size.width, 0) + (gap * (nodes.length - 1));
      const sides = nodes.map((node) => getPhoneBubbleSide(node));
      let cursorX = threadLeft + Math.round((threadWidth - totalWidth) / 2);
      if (sides.every((side) => side === 'left')) cursorX = threadLeft;
      if (sides.every((side) => side === 'right')) cursorX = threadLeft + threadWidth - totalWidth;

      nodes.forEach((node, index) => {
        const size = sizes[index];
        node.x = Math.round(cursorX);
        node.y = Math.round(row.rowTop);
        node.width = size.width;
        node.height = effectiveHeights[index];
        cursorX += size.width + gap;
      });
    });
  }

  positionProjectedRows(anytimeProjectedRows);
  positionProjectedRows(rows);

  const allProjectedRows = [...anytimeProjectedRows, ...rows];
  const threadBottom = allProjectedRows.length
    ? Math.max(threadTop, allProjectedRows[allProjectedRows.length - 1].rowTop + allProjectedRows[allProjectedRows.length - 1].rowHeight)
    : threadTop;
  const phoneHeight = Math.max(
    PHONE_MIN_DEVICE_HEIGHT,
    Math.round((threadBottom - PHONE_DEVICE_Y) + PHONE_COMPOSER_HEIGHT + 34)
  );
  const phoneBottom = PHONE_DEVICE_Y + phoneHeight;
  const stencilTrayTop = phoneBottom + PHONE_STENCIL_TRAY_GAP;
  const stencilTrayBottom = stencilTrayTop + PHONE_STENCIL_TRAY_HEIGHT;
  const stageBottom = shouldReserveStencilTraySpace()
    ? stencilTrayBottom + 28
    : phoneBottom + 28;

  if (outsideAnytimeLabel) {
    outsideAnytimeLabel.hidden = true;
  }

  state.layoutMetrics = {
    stageWidth: PHONE_STAGE_WIDTH,
    stageHeight: stageBottom,
    phoneWidth: PHONE_DEVICE_WIDTH,
    phoneHeight,
    phoneX: PHONE_DEVICE_X,
    phoneY: PHONE_DEVICE_Y,
    stencilTrayTop,
    threadLeft,
    threadTop: mainThreadTop,
    threadWidth
  };
}

function shouldReserveStencilTraySpace() {
  return !!(
    stencilBar
    && typeof window !== 'undefined'
    && window.getComputedStyle(stencilBar).display !== 'none'
  );
}

function getAttachedSubtreeIds(nodeId, visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) return visited;
  visited.add(nodeId);
  getOutgoingLinks(nodeId).forEach((link) => {
    getAttachedSubtreeIds(link.to, visited);
  });
  return visited;
}

function ignoreNodeMatcher(ignoreNodeId) {
  if (ignoreNodeId instanceof Set) return (nodeId) => ignoreNodeId.has(nodeId);
  if (Array.isArray(ignoreNodeId)) return (nodeId) => ignoreNodeId.includes(nodeId);
  if (ignoreNodeId == null) return () => false;
  return (nodeId) => nodeId === ignoreNodeId;
}

function getNodeOutPorts(nodeOrType) {
  const type = typeof nodeOrType === 'string' ? nodeOrType : (nodeOrType && nodeOrType.type);
  if (type === 'bubble') return isAnytimeGuideNode(nodeOrType) ? [] : ['out-right'];
  if (type === 'reply') return isAnytimeReplyNode(nodeOrType) ? ['out-right'] : ['out-right', 'out-bottom'];
  if (TYPE_CONFIG[type]) return ['out-right'];
  return [];
}

function normalizeFromPort(nodeOrType, rawPort) {
  const allowed = getNodeOutPorts(nodeOrType);
  const port = String(rawPort || '').trim().toLowerCase();
  if (allowed.includes(port)) return port;
  if (port === 'out-bottom') return allowed.includes('out-bottom') ? 'out-bottom' : (allowed[0] || 'out-right');
  return allowed[0] || 'out-right';
}

function getUsedOutPorts(nodeId, links = state.doc.links) {
  const used = new Set();
  links.forEach((link) => {
    if (!link || link.from !== nodeId) return;
    used.add(normalizeFromPort(getNode(nodeId) || parseTypedNodeId(nodeId)?.type, link.fromPort));
  });
  return used;
}

function getPreferredOutPortY(node, fromPort) {
  const normalizedPort = normalizeFromPort(node, fromPort);
  if (normalizedPort === 'out-bottom') return node.y + node.height;
  return node.y + node.height / 2;
}

function getAvailableVariableNames() {
  const names = new Set();
  state.doc.nodes.forEach((node) => {
    if (!node || node.type !== 'reply') return;
    const name = normalizeVariableName(node.varName);
    if (name) names.add(name);
  });
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function rememberGuideInsertSelection() {
  if (!objectBodyInput) return;
  if (typeof objectBodyInput.selectionStart !== 'number' || typeof objectBodyInput.selectionEnd !== 'number') return;
  state.guideInsertSelectionStart = objectBodyInput.selectionStart;
  state.guideInsertSelectionEnd = objectBodyInput.selectionEnd;
}

function getGuideInsertSelectionRange() {
  const currentValue = objectBodyInput ? String(objectBodyInput.value || '') : '';
  if (
    objectBodyInput
    && document.activeElement === objectBodyInput
    && typeof objectBodyInput.selectionStart === 'number'
    && typeof objectBodyInput.selectionEnd === 'number'
  ) {
    rememberGuideInsertSelection();
    return {
      start: objectBodyInput.selectionStart,
      end: objectBodyInput.selectionEnd
    };
  }

  const max = currentValue.length;
  const rawStart = typeof state.guideInsertSelectionStart === 'number' ? state.guideInsertSelectionStart : max;
  const rawEnd = typeof state.guideInsertSelectionEnd === 'number' ? state.guideInsertSelectionEnd : rawStart;
  const start = Math.max(0, Math.min(max, rawStart));
  const end = Math.max(start, Math.min(max, rawEnd));
  return { start, end };
}

function escapeInsertedHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isGuideInsertMenuOpen() {
  return !!(guideInsertMenu && !guideInsertMenu.hidden);
}

function positionGuideInsertMenu() {
  if (!guideInsertMenu || guideInsertMenu.hidden || !objectInsertBtn) return;
  const anchorRect = objectInsertBtn.getBoundingClientRect();
  const menuRect = guideInsertMenu.getBoundingClientRect();
  let left = anchorRect.left;
  const maxLeft = window.innerWidth - menuRect.width - 12;
  if (left > maxLeft) left = Math.max(12, maxLeft);

  let top = anchorRect.top - menuRect.height - 8;
  if (top < 12) {
    top = Math.min(window.innerHeight - menuRect.height - 12, anchorRect.bottom + 8);
  }

  guideInsertMenu.style.left = Math.round(left) + 'px';
  guideInsertMenu.style.top = Math.round(Math.max(12, top)) + 'px';
}

function showGuideInsertRoot() {
  if (!guideInsertMenu) return;
  if (guideInsertRoot) guideInsertRoot.hidden = false;
  if (guideInsertVariablePanel) guideInsertVariablePanel.hidden = true;
  if (guideInsertLinkPanel) guideInsertLinkPanel.hidden = true;
  if (guideInsertImagePanel) guideInsertImagePanel.hidden = true;
  if (guideInsertStoredInfoBtn) guideInsertStoredInfoBtn.disabled = false;
  requestAnimationFrame(positionGuideInsertMenu);
}

function closeGuideInsertMenu(options = {}) {
  const restoreFocus = options.restoreFocus !== false;
  if (!guideInsertMenu || guideInsertMenu.hidden) return;
  const previousFocus = state.guideInsertMenuPreviousFocus;
  state.guideInsertMenuPreviousFocus = null;
  guideInsertMenu.hidden = true;
  guideInsertMenu.classList.remove('is-direct');
  if (guideInsertRoot) guideInsertRoot.hidden = false;
  if (guideInsertVariablePanel) guideInsertVariablePanel.hidden = true;
  if (guideInsertLinkPanel) guideInsertLinkPanel.hidden = true;
  if (guideInsertImagePanel) guideInsertImagePanel.hidden = true;
  if (guideInsertVariableList) guideInsertVariableList.innerHTML = '';
  if (guideInsertLinkTextInput) guideInsertLinkTextInput.value = '';
  if (guideInsertLinkAddressInput) guideInsertLinkAddressInput.value = '';
  if (guideInsertImageAddressInput) guideInsertImageAddressInput.value = '';
  guideInsertMenu.style.left = '';
  guideInsertMenu.style.top = '';
  if (
    restoreFocus
    && previousFocus
    && typeof previousFocus.focus === 'function'
    && document.contains(previousFocus)
  ) {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch (error) {
      previousFocus.focus();
    }
  }
}

function isBuilderTutorialMode() {
  return BUILDER_PAGE_MODE === BUILDER_TUTORIAL_MODE;
}

function getBuilderTutorialSteps() {
  return [
    {
      id: 'intro',
      anchor: gamesPageHero,
      placement: 'bottom-right',
      title: 'The Game Bureau and Games',
      copy: 'The Game Bureau makes guided text-message games. In this builder, one game is one complete experience: its branding, guide, teams, rules, and conversation map all live together here.'
    },
    {
      id: 'game-details',
      anchor: inspector,
      placement: 'right',
      title: 'Game Details',
      copy: 'This panel is the game-level setup. Use it to shape the game name, logo, guide, description, teams, colors, tags, and logic before you get deep into the conversation flow.'
    },
    {
      id: 'bubbles',
      anchor: addPanel,
      placement: 'right',
      title: 'Bubbles',
      copy: 'This is the quick-build pane. Add new waypoints, guide messages, player replies, and buttons here, or pull saved waypoints in from the library below.'
    },
    {
      id: 'phone',
      anchor: phoneShell,
      placement: 'left',
      title: 'Phone Workspace',
      copy: 'This phone is the live story canvas. Arrange the path here the way a player will feel it: guide messages, player responses, buttons, and the branches between them.'
    }
  ].filter((step) => !!step.anchor);
}

function isVisibleTutorialAnchor(element) {
  return !!(
    element
    && typeof element.getBoundingClientRect === 'function'
    && element.getClientRects().length
    && !element.hidden
  );
}

function clearBuilderTutorialTarget() {
  if (state.builderTutorialTarget && state.builderTutorialTarget.classList) {
    state.builderTutorialTarget.classList.remove('builder-tutorial-target');
  }
  state.builderTutorialTarget = null;
}

function setBuilderTutorialTarget(element) {
  clearBuilderTutorialTarget();
  if (!element || !element.classList) return;
  element.classList.add('builder-tutorial-target');
  state.builderTutorialTarget = element;
}

function closeBuilderTutorial() {
  clearBuilderTutorialTarget();
  state.builderTutorialActive = false;
  state.builderTutorialIndex = -1;
  if (!builderTutorialPopover) return;
  builderTutorialPopover.hidden = true;
  builderTutorialPopover.style.left = '';
  builderTutorialPopover.style.top = '';
}

function getBuilderTutorialActiveStep() {
  const steps = getBuilderTutorialSteps();
  if (!steps.length) return null;
  if (state.builderTutorialIndex < 0 || state.builderTutorialIndex >= steps.length) return null;
  return steps[state.builderTutorialIndex];
}

function positionBuilderTutorialPopover() {
  if (!state.builderTutorialActive || !builderTutorialPopover || builderTutorialPopover.hidden) return;
  const step = getBuilderTutorialActiveStep();
  if (!step) return;

  const fallbackAnchor = gamesPageHero || inspector || mainGrid || phoneShell || addPanel;
  const anchor = isVisibleTutorialAnchor(step.anchor) ? step.anchor : fallbackAnchor;
  if (!anchor) return;

  setBuilderTutorialTarget(anchor);

  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = builderTutorialPopover.getBoundingClientRect();
  const margin = 12;
  const gap = 14;
  let left = anchorRect.left;
  let top = anchorRect.bottom + gap;

  if (step.placement === 'right') {
    left = anchorRect.right + gap;
    top = anchorRect.top;
    if (left + menuRect.width > window.innerWidth - margin) {
      left = anchorRect.left - menuRect.width - gap;
    }
  } else if (step.placement === 'left') {
    left = anchorRect.left - menuRect.width - gap;
    top = anchorRect.top;
    if (left < margin) {
      left = anchorRect.right + gap;
    }
  } else if (step.placement === 'bottom-right') {
    left = anchorRect.right - menuRect.width;
    top = anchorRect.bottom + gap;
  }

  if (top + menuRect.height > window.innerHeight - margin) {
    top = anchorRect.top - menuRect.height - gap;
  }
  if (top < margin) {
    top = Math.max(margin, Math.min(anchorRect.bottom + gap, window.innerHeight - menuRect.height - margin));
  }
  if (left + menuRect.width > window.innerWidth - margin) {
    left = window.innerWidth - menuRect.width - margin;
  }
  if (left < margin) {
    left = margin;
  }

  builderTutorialPopover.style.left = Math.round(left) + 'px';
  builderTutorialPopover.style.top = Math.round(top) + 'px';
}

function openBuilderTutorialStep(index) {
  if (!builderTutorialPopover) return;
  const steps = getBuilderTutorialSteps();
  if (!steps.length) return;

  const nextIndex = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[nextIndex];
  state.builderTutorialStarted = true;
  state.builderTutorialActive = true;
  state.builderTutorialIndex = nextIndex;

  if (builderTutorialStepCount) {
    builderTutorialStepCount.textContent = `${nextIndex + 1} OF ${steps.length}`;
  }
  if (builderTutorialTitle) builderTutorialTitle.textContent = step.title;
  if (builderTutorialCopy) builderTutorialCopy.textContent = step.copy;
  if (builderTutorialBackBtn) builderTutorialBackBtn.disabled = nextIndex === 0;
  if (builderTutorialNextBtn) {
    builderTutorialNextBtn.textContent = nextIndex === steps.length - 1 ? 'Done' : 'Next';
  }

  builderTutorialPopover.hidden = false;
  requestAnimationFrame(positionBuilderTutorialPopover);
}

function startBuilderTutorialIfNeeded() {
  if (!isBuilderTutorialMode() || !builderTutorialPopover || state.builderTutorialStarted) return;
  const steps = getBuilderTutorialSteps();
  if (!steps.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      openBuilderTutorialStep(0);
    });
  });
}

function insertTextIntoGuideMessage(text) {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || !objectBodyInput || objectBodyInput.disabled) return false;
  const currentValue = String(objectBodyInput.value || '');
  const selection = getGuideInsertSelectionRange();
  const nextValue = currentValue.slice(0, selection.start) + text + currentValue.slice(selection.end);
  const caret = selection.start + text.length;

  node.body = nextValue;
  objectBodyInput.value = nextValue;
  closeGuideInsertMenu({ restoreFocus: false });
  closeVariableAutocomplete();
  renderAll();
  requestAnimationFrame(() => {
    try {
      objectBodyInput.focus({ preventScroll: true });
    } catch (error) {
      objectBodyInput.focus();
    }
    objectBodyInput.setSelectionRange(caret, caret);
    rememberGuideInsertSelection();
  });
  return true;
}

function renderGuideInsertVariableList() {
  if (!guideInsertVariableList) return;
  guideInsertVariableList.innerHTML = '';
  const names = getAvailableVariableNames();
  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'guide-insert-empty';
    empty.textContent = 'No previously stored info yet. Name a PLAYER MSG first.';
    guideInsertVariableList.appendChild(empty);
    return;
  }

  names.forEach((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'guide-insert-variable-btn';
    button.textContent = '%' + name + '%';
    button.addEventListener('click', () => {
      insertTextIntoGuideMessage('%' + name + '%');
    });
    guideInsertVariableList.appendChild(button);
  });
}

function openGuideInsertVariablePanel() {
  if (!guideInsertMenu || guideInsertMenu.hidden) return;
  renderGuideInsertVariableList();
  if (guideInsertRoot) guideInsertRoot.hidden = true;
  if (guideInsertVariablePanel) guideInsertVariablePanel.hidden = false;
  if (guideInsertLinkPanel) guideInsertLinkPanel.hidden = true;
  requestAnimationFrame(() => {
    positionGuideInsertMenu();
    const firstVariableButton = guideInsertVariableList && guideInsertVariableList.querySelector('button');
    const focusTarget = firstVariableButton || guideInsertVariableBackBtn;
    if (!focusTarget) return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (error) {
      focusTarget.focus();
    }
  });
}

function openGuideInsertLinkPanel() {
  if (!guideInsertMenu || guideInsertMenu.hidden) return;
  if (guideInsertRoot) guideInsertRoot.hidden = true;
  if (guideInsertVariablePanel) guideInsertVariablePanel.hidden = true;
  if (guideInsertLinkPanel) guideInsertLinkPanel.hidden = false;
  if (guideInsertImagePanel) guideInsertImagePanel.hidden = true;
  if (guideInsertLinkTextInput) guideInsertLinkTextInput.value = '';
  if (guideInsertLinkAddressInput) guideInsertLinkAddressInput.value = '';
  requestAnimationFrame(() => {
    positionGuideInsertMenu();
    if (!guideInsertLinkTextInput) return;
    try {
      guideInsertLinkTextInput.focus({ preventScroll: true });
    } catch (error) {
      guideInsertLinkTextInput.focus();
    }
  });
}

function openGuideInsertImagePanel() {
  if (!guideInsertMenu || guideInsertMenu.hidden) return;
  if (guideInsertRoot) guideInsertRoot.hidden = true;
  if (guideInsertVariablePanel) guideInsertVariablePanel.hidden = true;
  if (guideInsertLinkPanel) guideInsertLinkPanel.hidden = true;
  if (guideInsertImagePanel) guideInsertImagePanel.hidden = false;
  if (guideInsertImageAddressInput) guideInsertImageAddressInput.value = '';
  requestAnimationFrame(() => {
    positionGuideInsertMenu();
    if (!guideInsertImageAddressInput) return;
    try {
      guideInsertImageAddressInput.focus({ preventScroll: true });
    } catch (error) {
      guideInsertImageAddressInput.focus();
    }
  });
}

function openGuideInsertMenu() {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || !guideInsertMenu || !objectInsertBtn || !objectBodyInput || objectBodyInput.disabled) return;
  state.guideInsertMenuPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  rememberGuideInsertSelection();
  closeVariableAutocomplete();
  guideInsertMenu.hidden = false;
  if (node.kind === 'text') {
    guideInsertMenu.classList.add('is-direct');
    openGuideInsertVariablePanel();
  } else {
    guideInsertMenu.classList.remove('is-direct');
    showGuideInsertRoot();
    requestAnimationFrame(() => {
      positionGuideInsertMenu();
      const focusTarget = guideInsertStoredInfoBtn || guideInsertLinkBtn;
      if (!focusTarget) return;
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (error) {
        focusTarget.focus();
      }
    });
  }
}

function toggleGuideInsertMenu() {
  if (isGuideInsertMenuOpen()) {
    closeGuideInsertMenu();
    return;
  }
  openGuideInsertMenu();
}

function closeVariableAutocomplete() {
  variableAutocomplete.open = false;
  variableAutocomplete.items = [];
  variableAutocomplete.activeIndex = 0;
  variableAutocomplete.tokenStart = -1;
  variableAutocomplete.tokenEnd = -1;
  if (objectBodyAutocomplete) {
    objectBodyAutocomplete.hidden = true;
    objectBodyAutocomplete.innerHTML = '';
  }
}

function renderVariableAutocomplete() {
  if (!objectBodyAutocomplete || !variableAutocomplete.open || !variableAutocomplete.items.length) {
    closeVariableAutocomplete();
    return;
  }

  objectBodyAutocomplete.innerHTML = '';
  variableAutocomplete.items.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'field-autocomplete-item' + (index === variableAutocomplete.activeIndex ? ' is-active' : '');
    button.textContent = '%' + name + '%';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === variableAutocomplete.activeIndex ? 'true' : 'false');
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      applyVariableAutocomplete(name);
    });
    objectBodyAutocomplete.appendChild(button);
  });
  objectBodyAutocomplete.hidden = false;
}

function getVariableAutocompleteContext() {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || objectBodyInput.disabled) return null;
  if (document.activeElement !== objectBodyInput) return null;
  if (objectBodyInput.selectionStart !== objectBodyInput.selectionEnd) return null;

  const value = objectBodyInput.value;
  const caretIndex = objectBodyInput.selectionStart;
  if (typeof caretIndex !== 'number') return null;

  const beforeCaret = value.slice(0, caretIndex);
  const tokenStart = beforeCaret.lastIndexOf('%');
  if (tokenStart < 0) return null;

  const queryRaw = beforeCaret.slice(tokenStart + 1);
  if (/%/.test(queryRaw) || /\s/.test(queryRaw)) return null;
  if (queryRaw && !/^[A-Za-z_]\w*$/.test(queryRaw)) return null;

  const afterCaret = value.slice(caretIndex);
  const afterWordMatch = afterCaret.match(/^\w*/);
  let tokenEnd = caretIndex + (afterWordMatch ? afterWordMatch[0].length : 0);
  if (value.charAt(tokenEnd) === '%') tokenEnd += 1;

  const query = queryRaw.toLowerCase();
  const items = getAvailableVariableNames().filter((name) => !query || name.toLowerCase().startsWith(query));
  if (!items.length) return null;

  return {
    items,
    tokenStart,
    tokenEnd
  };
}

function updateVariableAutocomplete() {
  const context = getVariableAutocompleteContext();
  if (!context) {
    closeVariableAutocomplete();
    return;
  }

  const previousActiveName = variableAutocomplete.items[variableAutocomplete.activeIndex] || '';
  variableAutocomplete.open = true;
  variableAutocomplete.items = context.items;
  variableAutocomplete.tokenStart = context.tokenStart;
  variableAutocomplete.tokenEnd = context.tokenEnd;
  const matchedIndex = previousActiveName ? context.items.indexOf(previousActiveName) : -1;
  variableAutocomplete.activeIndex = matchedIndex >= 0 ? matchedIndex : 0;
  renderVariableAutocomplete();
}

function applyVariableAutocomplete(name) {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble') return;
  if (!variableAutocomplete.open) return;

  const insertion = '%' + name + '%';
  const currentValue = objectBodyInput.value;
  const nextValue = currentValue.slice(0, variableAutocomplete.tokenStart) + insertion + currentValue.slice(variableAutocomplete.tokenEnd);
  const caret = variableAutocomplete.tokenStart + insertion.length;

  node.body = nextValue;
  objectBodyInput.value = nextValue;
  closeVariableAutocomplete();
  renderAll();
  objectBodyInput.focus();
  objectBodyInput.setSelectionRange(caret, caret);
}

function countLinks(id, direction) {
  return state.doc.links.filter((link) => link[direction] === id).length;
}

function getInspectorHost() {
  return inspector ? (inspector.parentElement || document.body) : document.body;
}

function getDefaultInspectorPosition() {
  const host = getInspectorHost();
  const width = inspector ? (inspector.offsetWidth || 320) : 320;
  return {
    x: Math.max(12, host.clientWidth - width - 12),
    y: 12
  };
}

function clampInspectorPosition(x, y) {
  const host = getInspectorHost();
  const width = inspector ? (inspector.offsetWidth || 320) : 320;
  const height = inspector ? (inspector.offsetHeight || 140) : 140;
  return {
    x: clamp(Math.round(x), 12, Math.max(12, host.clientWidth - width - 12)),
    y: clamp(Math.round(y), 12, Math.max(12, host.clientHeight - height - 12))
  };
}

function applyInspectorPosition() {
  if (!inspector) return;
  inspector.style.left = '';
  inspector.style.top = '';
  inspector.style.right = '';
}

function getObjectInspectorHeading(node, link) {
  if (link) return 'CONNECTION DETAILS';
  if (!node) return 'OBJECT DETAILS';
  if (node.type === 'bubble') {
    if (node.kind === 'image') return 'GUIDE IMAGE DETAILS';
    if (node.kind === 'video') return 'GUIDE VIDEO DETAILS';
    if (node.kind === 'text') return 'GUIDE TEXT DETAILS';
    return 'GUIDE MSG DETAILS';
  }
  if (node.type === 'reply') return 'PLAYER MSG DETAILS';
  if (node.type === 'stop') return 'WAYPOINT DETAILS';
  if (node.type === 'button') return 'BUTTON DETAILS';
  return 'OBJECT DETAILS';
}

function syncInspectorHosts(node = getNode(state.selectedId), link = getLink(state.selectedLinkId)) {
  const showObjectInspector = !!link || !!(node && node.type !== 'game');
  state.objectInspectorVisible = showObjectInspector;
  if (mainGrid) mainGrid.classList.toggle('has-object-inspector', showObjectInspector);
  if (objectInspector) {
    objectInspector.hidden = !showObjectInspector;
    objectInspector.dataset.nodeType = node ? (node.type || '') : (link ? 'link' : '');
  }
  if (objectInspectorTitle) objectInspectorTitle.textContent = getObjectInspectorHeading(node, link);
  if (objectInspectorStack) objectInspectorStack.hidden = !showObjectInspector;
  if (inspectorStack) inspectorStack.hidden = state.gameDetailsCollapsed;
}

function setGameDetailsCollapsed(collapsed) {
  state.gameDetailsCollapsed = false;
  if (inspector) inspector.classList.toggle('is-collapsed', state.gameDetailsCollapsed);
  if (inspectorStack) inspectorStack.hidden = state.gameDetailsCollapsed;
  if (gameDetailsToggleBtn) {
    const isCollapsed = state.gameDetailsCollapsed;
    gameDetailsToggleBtn.textContent = isCollapsed ? '\u25bc' : '\u25b2';
    gameDetailsToggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    gameDetailsToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand game details' : 'Collapse game details');
    gameDetailsToggleBtn.title = isCollapsed ? 'Expand game details' : 'Collapse game details';
  }
}

function getCurrentGameLogoUrl(node = getGameNode()) {
  if (!node || node.type !== 'game') return '';
  return String(node.logoUrl || '').trim();
}

function normalizeAssetFileName(value) {
  return String(value || '').trim().split(/[\\/]/).pop() || '';
}

function buildPublishedGameLogoAssetUrl(fileName) {
  const normalizedFileName = normalizeAssetFileName(fileName);
  return normalizedFileName
    ? `${GAME_LOGO_ASSET_BASE_URL}${encodeURIComponent(normalizedFileName)}`
    : '';
}

function isPublishedGameLogoAssetFileName(fileName) {
  return /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(String(fileName || '').trim());
}

let gameLogoOnlineAssetsCache = null;
let gameLogoOnlineAssetsPromise = null;

function buildPublishedGameLogoAssetsFromNames(names) {
  return (Array.isArray(names) ? names : [])
    .map((name) => String(name || '').trim())
    .filter((name) => !!name && isPublishedGameLogoAssetFileName(name))
    .map((name) => ({
      name,
      url: buildPublishedGameLogoAssetUrl(name)
    }))
    .filter((item) => !!item.name && !!item.url)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

function normalizePublishedGameLogoAssetPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload && payload.files)) return payload.files;
  return [];
}

async function fetchAssetManifestNames(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(await response.text() || `Asset manifest failed with ${response.status}.`);
  }
  return normalizePublishedGameLogoAssetPayload(await response.json());
}

function probeImageUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }
    const probe = new Image();
    const separator = url.includes('?') ? '&' : '?';
    const finish = (result) => {
      probe.onload = null;
      probe.onerror = null;
      resolve(result);
    };
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = `${url}${separator}assetProbe=${Date.now()}`;
  });
}

function setGameLogoAssetStatus(message = '') {
  const nextMessage = String(message || '').trim();
  const hasError = !!nextMessage;
  if (gameLogoAssetStatus) {
    const msg = hasError ? nextMessage : GAME_LOGO_ASSET_DEFAULT_MESSAGE;
    gameLogoAssetStatus.textContent = msg;
    gameLogoAssetStatus.hidden = !msg;
    gameLogoAssetStatus.classList.toggle('is-error', hasError);
  }
  if (nodeGameLogoInput) {
    nodeGameLogoInput.classList.toggle('is-invalid', hasError);
  }
}

function setGuideImageAssetStatus(message = '') {
  const nextMessage = String(message || '').trim();
  const hasError = !!nextMessage;
  if (guideImageAssetStatus) {
    const msg = hasError ? nextMessage : '';
    guideImageAssetStatus.textContent = msg;
    guideImageAssetStatus.hidden = !msg;
    guideImageAssetStatus.classList.toggle('is-error', hasError);
  }
  if (nodeGuideImageInput) {
    nodeGuideImageInput.classList.toggle('is-invalid', hasError);
  }
}

async function fetchPublishedGameLogoAssets(forceRefresh = false) {
  if (!forceRefresh && Array.isArray(gameLogoOnlineAssetsCache)) {
    return gameLogoOnlineAssetsCache;
  }
  if (!forceRefresh && gameLogoOnlineAssetsPromise) {
    return gameLogoOnlineAssetsPromise;
  }

  gameLogoOnlineAssetsPromise = (async () => {
    let names = [];
    try {
      names = await fetchAssetManifestNames(GAME_LOGO_ASSET_MANIFEST_URL);
    } catch (publishedError) {
      try {
        names = await fetchAssetManifestNames(GAME_LOGO_LOCAL_ASSET_MANIFEST_URL);
      } catch (localError) {
        names = GAME_LOGO_FALLBACK_ASSET_NAMES;
      }
    }

    const assets = buildPublishedGameLogoAssetsFromNames(names);
    if (!assets.length) {
      throw new Error(GAME_LOGO_ONLINE_ASSET_ERROR_MESSAGE);
    }
    gameLogoOnlineAssetsCache = assets;
    return assets;
  })()
    .finally(() => {
      gameLogoOnlineAssetsPromise = null;
    });

  return gameLogoOnlineAssetsPromise;
}

function setGameLogoOnlineMenuOpen(isOpen) {
  const shouldOpen = !!isOpen;
  if (gameLogoOnlineMenu) gameLogoOnlineMenu.hidden = !shouldOpen;
  if (gameLogoOnlinePickBtn) gameLogoOnlinePickBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function setGuideImageOnlineMenuOpen(isOpen) {
  const shouldOpen = !!isOpen;
  if (guideImageOnlineMenu) guideImageOnlineMenu.hidden = !shouldOpen;
  if (guideImageOnlinePickBtn) guideImageOnlinePickBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function populateGameLogoOnlineMenu(assets) {
  if (!gameLogoOnlineList) return;

  const currentFileName = normalizeAssetFileName(getCurrentGameLogoUrl());
  gameLogoOnlineList.innerHTML = '';

  assets.forEach((asset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'guide-image-asset-item';
    if (asset.name === currentFileName) item.classList.add('is-selected');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', asset.name === currentFileName ? 'true' : 'false');
    item.dataset.assetUrl = asset.url;

    const thumb = document.createElement('img');
    thumb.className = 'guide-image-asset-item-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.src = asset.url;

    const name = document.createElement('span');
    name.className = 'guide-image-asset-item-name';
    name.textContent = asset.name;

    item.appendChild(thumb);
    item.appendChild(name);
    gameLogoOnlineList.appendChild(item);
  });

  setGameLogoOnlineMenuOpen(!!assets.length);
}

function populateGuideImageOnlineMenu(assets) {
  if (!guideImageOnlineList) return;

  const currentFileName = normalizeAssetFileName(getCurrentGuideImageUrl());
  guideImageOnlineList.innerHTML = '';

  assets.forEach((asset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'guide-image-asset-item';
    if (asset.name === currentFileName) item.classList.add('is-selected');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', asset.name === currentFileName ? 'true' : 'false');
    item.dataset.assetUrl = asset.url;

    const thumb = document.createElement('img');
    thumb.className = 'guide-image-asset-item-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.src = asset.url;

    const name = document.createElement('span');
    name.className = 'guide-image-asset-item-name';
    name.textContent = asset.name;

    item.appendChild(thumb);
    item.appendChild(name);
    guideImageOnlineList.appendChild(item);
  });

  setGuideImageOnlineMenuOpen(!!assets.length);
}

async function applyPublishedGameLogoUrl(url) {
  const node = getGameNode();
  if (!node || node.type !== 'game' || !nodeGameLogoInput) return false;
  const nextUrl = String(url || '').trim();
  if (!nextUrl) return false;
  const existsOnline = await probeImageUrl(nextUrl);
  if (!existsOnline) {
    setGameLogoAssetStatus(GAME_LOGO_ASSET_NOT_FOUND_MESSAGE);
    return false;
  }
  nodeGameLogoInput.value = nextUrl;
  setGameLogoAssetStatus('');
  syncSelectedGameLogoFromInput();
  updateSelectionUi();
  return true;
}

async function applyPublishedGuideImageUrl(url) {
  const node = getGameNode();
  if (!node || node.type !== 'game' || !nodeGuideImageInput) return false;
  const nextUrl = String(url || '').trim();
  if (!nextUrl) return false;
  const existsOnline = await probeImageUrl(nextUrl);
  if (!existsOnline) {
    setGuideImageAssetStatus(GUIDE_IMAGE_ASSET_NOT_FOUND_MESSAGE);
    return false;
  }
  nodeGuideImageInput.value = nextUrl;
  setGuideImageAssetStatus('');
  syncSelectedGameGuideImageFromInput();
  updateSelectionUi();
  updatePhoneChrome();
  return true;
}

async function openGameLogoOnlinePicker(forceRefresh = false) {
  if (!gameLogoOnlinePickBtn || !gameLogoOnlineMenu || !gameLogoOnlineList || !nodeGameLogoInput || nodeGameLogoInput.disabled) return false;

  if (!forceRefresh && !gameLogoOnlineMenu.hidden) {
    setGameLogoOnlineMenuOpen(false);
    return true;
  }

  setGameLogoAssetStatus('');
  gameLogoOnlinePickBtn.disabled = true;
  gameLogoOnlinePickBtn.textContent = 'Loading';

  try {
    const assets = await fetchPublishedGameLogoAssets(forceRefresh);
    populateGameLogoOnlineMenu(assets);
    const firstItem = gameLogoOnlineList.querySelector('.guide-image-asset-item');
    if (firstItem && typeof firstItem.focus === 'function') firstItem.focus();
    return true;
  } catch (error) {
    setGameLogoOnlineMenuOpen(false);
    setGameLogoAssetStatus(GAME_LOGO_ONLINE_ASSET_ERROR_MESSAGE);
    return false;
  } finally {
    gameLogoOnlinePickBtn.disabled = !nodeGameLogoInput || !!nodeGameLogoInput.disabled;
    gameLogoOnlinePickBtn.textContent = 'Choose';
  }
}

async function openGuideImageOnlinePicker(forceRefresh = false) {
  if (!guideImageOnlinePickBtn || !guideImageOnlineMenu || !guideImageOnlineList || !nodeGuideImageInput || nodeGuideImageInput.disabled) return false;

  if (!forceRefresh && !guideImageOnlineMenu.hidden) {
    setGuideImageOnlineMenuOpen(false);
    return true;
  }

  setGuideImageAssetStatus('');
  guideImageOnlinePickBtn.disabled = true;
  guideImageOnlinePickBtn.textContent = 'Loading';

  try {
    const assets = await fetchPublishedGameLogoAssets(forceRefresh);
    populateGuideImageOnlineMenu(assets);
    const firstItem = guideImageOnlineList.querySelector('.guide-image-asset-item');
    if (firstItem && typeof firstItem.focus === 'function') firstItem.focus();
    return true;
  } catch (error) {
    setGuideImageOnlineMenuOpen(false);
    setGuideImageAssetStatus(GUIDE_IMAGE_ONLINE_ASSET_ERROR_MESSAGE);
    return false;
  } finally {
    guideImageOnlinePickBtn.disabled = !nodeGuideImageInput || !!nodeGuideImageInput.disabled;
    guideImageOnlinePickBtn.textContent = 'Choose';
  }
}

function getCurrentGuideImageUrl(node = getGameNode()) {
  if (!node || node.type !== 'game') return '';
  return String(node.guideImageUrl || '').trim();
}

function isGuideImageLightboxOpen() {
  return !!(guideImageLightboxBackdrop && !guideImageLightboxBackdrop.hidden);
}

function closeGuideImageLightbox() {
  if (!guideImageLightboxBackdrop || guideImageLightboxBackdrop.hidden) return;
  guideImageLightboxBackdrop.hidden = true;
  if (guideImageLightboxImage) {
    guideImageLightboxImage.removeAttribute('src');
  }
  document.body.classList.remove('guide-image-lightbox-open');
  const previousFocus = state.guideImageLightboxPreviousFocus;
  state.guideImageLightboxPreviousFocus = null;
  if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
    previousFocus.focus();
  }
}

function openGuideImageLightbox() {
  const imageUrl = getCurrentGuideImageUrl();
  if (!imageUrl || !guideImageLightboxBackdrop || !guideImageLightboxImage) return false;
  state.guideImageLightboxPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  guideImageLightboxImage.src = imageUrl;
  guideImageLightboxBackdrop.hidden = false;
  document.body.classList.add('guide-image-lightbox-open');
  if (guideImageLightboxCloseBtn) guideImageLightboxCloseBtn.focus();
  return true;
}

function updateGameLogoPreview(node = getNode(state.selectedId)) {
  const imageUrl = getCurrentGameLogoUrl(node);
  const hasImage = !!imageUrl;

  if (gameLogoThumbBtn) {
    gameLogoThumbBtn.disabled = !hasImage;
    gameLogoThumbBtn.classList.toggle('is-empty', !hasImage);
    gameLogoThumbBtn.classList.remove('is-broken');
    gameLogoThumbBtn.setAttribute('aria-label', hasImage ? 'Open game logo preview' : 'No game logo selected');
  }

  if (!hasImage) {
    if (gameLogoThumbImage) {
      gameLogoThumbImage.hidden = true;
      gameLogoThumbImage.removeAttribute('src');
    }
    if (gameLogoThumbPlaceholder) {
      gameLogoThumbPlaceholder.hidden = false;
      gameLogoThumbPlaceholder.textContent = 'No image';
    }
    return;
  }

  if (gameLogoThumbImage) {
    gameLogoThumbImage.hidden = false;
    gameLogoThumbImage.src = imageUrl;
  }
  if (gameLogoThumbPlaceholder) {
    gameLogoThumbPlaceholder.hidden = true;
  }
  if (isGuideImageLightboxOpen() && guideImageLightboxImage) {
    guideImageLightboxImage.src = imageUrl;
  }
}

function openGameLogoLightbox() {
  const imageUrl = getCurrentGameLogoUrl();
  if (!imageUrl || !guideImageLightboxBackdrop || !guideImageLightboxImage) return false;
  state.guideImageLightboxPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  guideImageLightboxImage.src = imageUrl;
  guideImageLightboxBackdrop.hidden = false;
  document.body.classList.add('guide-image-lightbox-open');
  if (guideImageLightboxCloseBtn) guideImageLightboxCloseBtn.focus();
  return true;
}

function syncSelectedGameLogoFromInput() {
  const node = getGameNode();
  if (!node || node.type !== 'game' || !nodeGameLogoInput) return false;
  const nextValue = String(nodeGameLogoInput.value || '');
  if ((node.logoUrl || '') === nextValue) return false;
  node.logoUrl = nextValue;
  return true;
}

function updateGuideImagePreview(node = getNode(state.selectedId)) {
  const imageUrl = getCurrentGuideImageUrl(node);
  const hasImage = !!imageUrl;

  if (guideImageThumbBtn) {
    guideImageThumbBtn.disabled = !hasImage;
    guideImageThumbBtn.classList.toggle('is-empty', !hasImage);
    guideImageThumbBtn.classList.remove('is-broken');
    guideImageThumbBtn.setAttribute('aria-label', hasImage ? 'Open guide logo preview' : 'No guide logo selected');
  }

  if (!hasImage) {
    if (guideImageThumbImage) {
      guideImageThumbImage.hidden = true;
      guideImageThumbImage.removeAttribute('src');
    }
    if (guideImageThumbPlaceholder) {
      guideImageThumbPlaceholder.hidden = false;
      guideImageThumbPlaceholder.textContent = 'No image';
    }
    closeGuideImageLightbox();
    return;
  }

  if (guideImageThumbImage) {
    guideImageThumbImage.hidden = false;
    guideImageThumbImage.src = imageUrl;
  }
  if (guideImageThumbPlaceholder) {
    guideImageThumbPlaceholder.hidden = true;
  }
  if (isGuideImageLightboxOpen() && guideImageLightboxImage) {
    guideImageLightboxImage.src = imageUrl;
  }
}

function syncSelectedGameGuideImageFromInput() {
  const node = getGameNode();
  if (!node || node.type !== 'game' || !nodeGuideImageInput) return false;
  const nextValue = String(nodeGuideImageInput.value || '');
  if ((node.guideImageUrl || '') === nextValue) return false;
  node.guideImageUrl = nextValue;
  return true;
}

function getCurrentBubbleImageUrl(node) {
  if (!node || node.type !== 'bubble') return '';
  return String(node.body || '').trim();
}

function setBubbleImageAssetStatus(message) {
  const nextMessage = String(message || '').trim();
  const hasError = !!nextMessage;
  if (objectBubbleImageAssetStatus) {
    objectBubbleImageAssetStatus.textContent = hasError ? nextMessage : '';
    objectBubbleImageAssetStatus.hidden = !hasError;
    objectBubbleImageAssetStatus.classList.toggle('is-error', hasError);
  }
}

function setBubbleImageOnlineMenuOpen(isOpen) {
  const shouldOpen = !!isOpen;
  if (objectBubbleImageOnlineMenu) objectBubbleImageOnlineMenu.hidden = !shouldOpen;
  if (objectBubbleImageOnlinePickBtn) objectBubbleImageOnlinePickBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function populateBubbleImageOnlineMenu(assets) {
  if (!objectBubbleImageOnlineList) return;
  const currentFileName = normalizeAssetFileName(getCurrentBubbleImageUrl(getNode(state.selectedId)));
  objectBubbleImageOnlineList.innerHTML = '';
  assets.forEach((asset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'guide-image-asset-item' + (normalizeAssetFileName(asset.url) === currentFileName ? ' is-selected' : '');
    item.setAttribute('data-asset-url', asset.url);
    const thumb = document.createElement('img');
    thumb.className = 'guide-image-asset-thumb';
    thumb.src = asset.url;
    thumb.alt = '';
    thumb.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'guide-image-asset-name';
    name.textContent = asset.name || asset.url;
    item.appendChild(thumb);
    item.appendChild(name);
    objectBubbleImageOnlineList.appendChild(item);
  });
  setBubbleImageOnlineMenuOpen(!!assets.length);
}

function syncSelectedBubbleImageFromInput() {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || node.kind !== 'image' || !objectBubbleImageInput) return false;
  const nextValue = String(objectBubbleImageInput.value || '');
  if ((node.body || '') === nextValue) return false;
  node.body = nextValue;
  return true;
}

function updateBubbleImagePreview(node) {
  const imageUrl = getCurrentBubbleImageUrl(node);
  const hasImage = !!imageUrl;
  if (objectBubbleImageThumbBtn) {
    objectBubbleImageThumbBtn.disabled = !hasImage;
    objectBubbleImageThumbBtn.classList.toggle('is-empty', !hasImage);
    objectBubbleImageThumbBtn.classList.remove('is-broken');
    objectBubbleImageThumbBtn.setAttribute('aria-label', hasImage ? 'Open image preview' : 'No image selected');
  }
  if (!hasImage) {
    if (objectBubbleImageThumbImage) objectBubbleImageThumbImage.hidden = true;
    if (objectBubbleImageThumbPlaceholder) objectBubbleImageThumbPlaceholder.hidden = false;
    return;
  }
  if (objectBubbleImageThumbImage) {
    objectBubbleImageThumbImage.hidden = false;
    objectBubbleImageThumbImage.src = imageUrl;
  }
  if (objectBubbleImageThumbPlaceholder) objectBubbleImageThumbPlaceholder.hidden = true;
}

async function openBubbleImageOnlinePicker(forceRefresh = false) {
  if (!objectBubbleImageOnlinePickBtn || !objectBubbleImageOnlineMenu || !objectBubbleImageOnlineList || !objectBubbleImageInput || objectBubbleImageInput.disabled) return false;
  if (!forceRefresh && !objectBubbleImageOnlineMenu.hidden) {
    setBubbleImageOnlineMenuOpen(false);
    return true;
  }
  setBubbleImageAssetStatus('');
  objectBubbleImageOnlinePickBtn.disabled = true;
  objectBubbleImageOnlinePickBtn.textContent = 'Loading';
  try {
    const assets = await fetchPublishedGameLogoAssets(forceRefresh);
    populateBubbleImageOnlineMenu(assets);
    const firstItem = objectBubbleImageOnlineList.querySelector('.guide-image-asset-item');
    if (firstItem) firstItem.focus();
  } catch (error) {
    setBubbleImageOnlineMenuOpen(false);
    setBubbleImageAssetStatus(GUIDE_IMAGE_ONLINE_ASSET_ERROR_MESSAGE);
    return false;
  } finally {
    objectBubbleImageOnlinePickBtn.disabled = !objectBubbleImageInput || !!objectBubbleImageInput.disabled;
    objectBubbleImageOnlinePickBtn.textContent = 'Uploaded';
  }
  return true;
}

async function applyPublishedBubbleImageUrl(url) {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || node.kind !== 'image' || !objectBubbleImageInput) return false;
  const nextUrl = String(url || '').trim();
  if (!nextUrl) return false;
  const existsOnline = await probeImageUrl(nextUrl);
  if (!existsOnline) {
    setBubbleImageAssetStatus(GUIDE_IMAGE_ASSET_NOT_FOUND_MESSAGE);
    return false;
  }
  objectBubbleImageInput.value = nextUrl;
  setBubbleImageAssetStatus('');
  syncSelectedBubbleImageFromInput();
  updateBubbleImagePreview(node);
  renderAll();
  return true;
}

function refreshInspectorWindowUi() {
  if (!inspector) return;
  const node = getNode(state.selectedId);
  const link = getLink(state.selectedLinkId);
  if (inspectorWindowTitleText) inspectorWindowTitleText.textContent = 'GAME DETAILS';
  else if (inspectorWindowTitle) inspectorWindowTitle.textContent = 'GAME DETAILS';
  if (inspectorWindowSubtitle) {
    inspectorWindowSubtitle.textContent = node
      ? 'Editing ' + (getNodeKicker(node) || 'Selected Item') + '.'
      : link
        ? 'Editing Connection.'
        : 'Select something to edit.';
  }
  setGameDetailsCollapsed(state.gameDetailsCollapsed);
  if (!inspector.hidden) {
    window.requestAnimationFrame(applyInspectorPosition);
  }
}

function isBubbleLikeType(type) {
  return type === 'bubble' || type === 'reply';
}

function normalizeVarValues(raw) {
  return Array.from({ length: 4 }, (_, index) => {
    if (Array.isArray(raw) && raw[index] != null) return String(raw[index]);
    return '';
  });
}

function getLegacyAskBubbleBody(raw) {
  const body = raw && raw.body ? String(raw.body).trim() : '';
  const values = normalizeVarValues(raw && raw.varValues)
    .map((value) => value.trim())
    .filter(Boolean);

  if (body && values.length) return body + '\n' + values.join(' / ');
  if (body) return body;
  return values.join(' / ');
}

function getNormalizedNodeType(raw) {
  const rawType = raw && raw.type ? String(raw.type) : 'stop';
  return rawType === 'ask'
    ? 'bubble'
    : (TYPE_CONFIG[rawType] ? rawType : 'stop');
}

function syncNextNodeNumbers() {
  const counters = createNodeIdCounters();
  state.doc.nodes.forEach((node) => {
    const parsed = parseTypedNodeId(node.id);
    if (parsed && parsed.type === node.type) {
      counters[node.type] = Math.max(counters[node.type], parsed.number + 1);
    }
  });
  state.nextNodeNumbers = counters;
}

function normalizeNode(raw, typeOverride = null, idOverride = null) {
  const rawType = raw && raw.type ? String(raw.type) : 'stop';
  const type = typeOverride || getNormalizedNodeType(raw);
  const config = TYPE_CONFIG[type];
  const id = idOverride || makeId(type);
  const gameSlot = type === 'game' ? getGameHomeSlot() : null;
  const anytime = (type === 'reply' || type === 'bubble') && !!(raw && raw.anytime);
  const anytimePairId = anytime
    ? String(raw && (raw.anytimePairId || raw.pairId || '') || '').trim()
    : '';
  const rawBody = rawType === 'ask'
    ? getLegacyAskBubbleBody(raw)
    : raw && raw.body ? String(raw.body) : config.body;
  const replyVarName = type === 'reply' ? getLegacyReplyVarName(raw) : '';
  const teamFieldState = getTeamFieldState(raw);
  return {
    id,
    type,
    x: gameSlot ? gameSlot.x : normalizeGridAnchoredValue(raw && raw.x, 'x'),
    y: gameSlot ? gameSlot.y : normalizeGridAnchoredValue(raw && raw.y, 'y'),
    width: config.width,
    height: config.height,
    title: usesNodeTitle(type) && raw && typeof raw.title === 'string' && raw.title.trim()
      ? (type === 'stop'
          ? normalizeWaypointTitle(raw.title, getDefaultNodeTitle(type, id))
          : String(raw.title))
      : getDefaultNodeTitle(type, id),
    tagline: raw && typeof raw.tagline === 'string' ? raw.tagline : '',
    featured: raw && typeof raw.featured === 'string' ? raw.featured : '',
    city: raw && typeof raw.city === 'string' ? raw.city : '',
    startingLocation: raw && typeof raw.startingLocation === 'string' ? raw.startingLocation : '',
    howToPlay: raw && typeof raw.howToPlay === 'string' ? raw.howToPlay : '',

    guideName: raw && typeof raw.guideName === 'string' ? raw.guideName : '',
    guideBio: raw && typeof raw.guideBio === 'string' ? raw.guideBio : '',
    guideImageUrl: raw && typeof raw.guideImageUrl === 'string' ? raw.guideImageUrl : '',
    logoUrl: raw && typeof raw.logoUrl === 'string' ? raw.logoUrl : '',
    price: raw && typeof raw.price === 'string' ? raw.price : '',
    builderNotes: raw && typeof raw.builderNotes === 'string' ? raw.builderNotes : '',
    tags: Array.isArray(raw && raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof (raw && raw.tag) === 'string'
        ? raw.tag.split(/[;,]+/).map((tag) => tag.trim()).filter(Boolean)
        : [],
    ...teamFieldState,
    waypointGroup: type === 'stop' ? normalizeWaypointGroup(raw && raw.waypointGroup) : '',
    body: (type === 'reply' && !!(raw && raw.acceptAny))
      ? ''
      : (type === 'reply' && !normalizeVariableName(raw && raw.varName) && isVariableOnlyBody(rawBody))
        ? ''
        : rawBody,
    varName: replyVarName,
    acceptAny: type === 'reply' ? !!(raw && raw.acceptAny) : false,
    anytime,
    anytimePairId,
    buttonUrl: raw && typeof raw.buttonUrl === 'string' ? raw.buttonUrl : '',
    tertiaryColor: normalizeTertiaryColorValue(raw && raw.tertiaryColor),
    quaternaryColor: normalizeQuaternaryColorValue(raw && raw.quaternaryColor),
    rotation: normalizeNodeRotation(raw && raw.rotation, type),
    orderIndex: normalizeNodeOrderIndex(raw && raw.orderIndex),
    kind: type === 'bubble'
      ? (raw && typeof raw.kind === 'string' && raw.kind ? raw.kind : 'text')
      : ''
  };
}

function normalizeDoc(raw) {
  const doc = raw && typeof raw === 'object' ? raw : {};
  const incomingNodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const counters = createNodeIdCounters();
  const usedIds = new Set();
  const nodeIdMap = new Map();
  const nodes = incomingNodes.map((node, index) => {
    const type = getNormalizedNodeType(node);
    const rawId = node && node.id != null ? String(node.id) : '__node__' + index;
    const parsedId = parseTypedNodeId(rawId);
    const normalizedId = parsedId && parsedId.type === type && !usedIds.has(parsedId.id)
      ? (() => {
          usedIds.add(parsedId.id);
          counters[type] = Math.max(counters[type], parsedId.number + 1);
          return parsedId.id;
        })()
      : makeId(type, counters, usedIds);
    nodeIdMap.set(rawId, normalizedId);
    return normalizeNode(node, type, normalizedId);
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  assignSequentialOrderIndices(nodes);
  const usedPortsByNode = new Map();
  const links = Array.isArray(doc.links)
    ? doc.links
        .map((link, index) => ({
          id: link.id ? String(link.id) : 'link-' + index,
          from: nodeIdMap.get(String(link && link.from != null ? link.from : '')) || String(link && link.from != null ? link.from : ''),
          to: nodeIdMap.get(String(link && link.to != null ? link.to : '')) || String(link && link.to != null ? link.to : ''),
          fromPort: link && link.fromPort != null ? String(link.fromPort) : 'out-right'
        }))
        .filter((link) => {
          if (!nodeIds.has(link.from) || !nodeIds.has(link.to) || link.from === link.to) return false;
          return canNodeConnectTo(nodeMap.get(link.from), nodeMap.get(link.to));
        })
        .map((link) => {
          const fromNode = nodeMap.get(link.from);
          const allowed = getNodeOutPorts(fromNode);
          const usedPorts = usedPortsByNode.get(link.from) || new Set();
          let normalizedPort = normalizeFromPort(fromNode, link.fromPort);
          if (usedPorts.has(normalizedPort)) {
            normalizedPort = allowed.find((port) => !usedPorts.has(port)) || normalizedPort;
          }
          usedPorts.add(normalizedPort);
          usedPortsByNode.set(link.from, usedPorts);
          return {
            ...link,
            fromPort: normalizedPort
          };
        })
    : [];

  return {
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : '',
    nodes,
    links
  };
}

function getDocName(doc = state.doc) {
  const gameNode = doc.nodes.find((node) => node.type === 'game');
  return gameNode && gameNode.title && gameNode.title.trim()
    ? gameNode.title.trim()
    : 'Untitled Game';
}

function getGridSlotPosition(type, col, row) {
  const config = TYPE_CONFIG[type];
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  return {
    x: snap(origin.x + (col * major) + ((major - config.width) / 2)),
    y: snap(origin.y + (row * major) + ((major - config.height) / 2))
  };
}

function getGameHomeSlot() {
  return getGridSlotPosition('game', GAME_HOME_COL, GAME_HOME_ROW);
}

function isReservedGameSlot(col, row) {
  return col === GAME_HOME_COL && row === GAME_HOME_ROW;
}

function isPlacementSlotAllowed(type, col, row) {
  if (type === 'game') return isReservedGameSlot(col, row);
  return !isReservedGameSlot(col, row);
}

function getNodeGridCell(node) {
  if (!node) return null;
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const columns = getPlacementGridColumns();
  const rows = getPlacementGridRows();
  return {
    col: clamp(Math.floor(((node.x + (node.width / 2)) - origin.x) / major), 0, columns - 1),
    row: clamp(Math.floor(((node.y + (node.height / 2)) - origin.y) / major), 0, rows - 1)
  };
}

function getDocSnapshot(doc = state.doc) {
  const colors = getCurrentGameColors();
  return JSON.stringify({
    currentGameId: state.currentGameId || '',
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      title: node.title,
      tagline: node.tagline || '',
      featured: node.featured || '',
      city: node.city || '',
      startingLocation: node.startingLocation || '',
      howToPlay: node.howToPlay || '',
      guideName: node.guideName || '',
      guideBio: node.guideBio || '',
      guideImageUrl: node.guideImageUrl || '',
      logoUrl: node.logoUrl || '',
      price: node.price || '',
      builderNotes: node.builderNotes || '',
      tags: (node.tags || []).filter(Boolean),
      ...getTeamFieldState(node),
      body: node.body || '',
      buttonUrl: node.buttonUrl || '',
      tertiaryColor: node.tertiaryColor || '',
      quaternaryColor: node.quaternaryColor || '',
      varName: node.varName || '',
      acceptAny: !!node.acceptAny,
      anytime: !!node.anytime,
      anytimePairId: node.anytimePairId || '',
      rotation: getNodeRotation(node),
      orderIndex: normalizeNodeOrderIndex(node.orderIndex)
    })),
    links: doc.links.map((link) => ({
      from: link.from,
      to: link.to,
      fromPort: normalizeFromPort(getNode(link.from) || parseTypedNodeId(link.from)?.type, link.fromPort)
    }))
  });
}

function rememberCleanSnapshot() {
  state.cleanSnapshot = getDocSnapshot();
}

function isPristineStarterDoc(doc = state.doc) {
  if (state.currentGameId) return false;
  if (!doc || doc.nodes.length !== 1 || doc.links.length !== 0) return false;

  const node = doc.nodes[0];
  const slot = getGameHomeSlot();
  const defaultColors = getSavedGameColors({ id: 'draft-game', name: getDocName(doc) }, state.store.games.length);
  const currentColors = getCurrentGameColors();
  return !!node
    && node.type === 'game'
    && node.id === 'gm-01'
    && node.x === slot.x
    && node.y === slot.y
    && node.title === TYPE_CONFIG.game.title
    && (node.tagline || '') === 'Shall We Play A Game?'
    && (node.guideName || '') === 'Mission Control'
    && (node.guideImageUrl || '') === ''
    && (node.price || '') === 'Free To Start / In App Purchases'
    && Array.isArray(node.tags)
    && node.tags.length === 0
    && (node.body || '') === TYPE_CONFIG.game.body
    && currentColors.primaryColor === defaultColors.primaryColor
    && currentColors.secondaryColor === defaultColors.secondaryColor;
}

function hasUnsavedChanges() {
  if (isPristineStarterDoc()) return false;
  return state.cleanSnapshot != null && getDocSnapshot() !== state.cleanSnapshot;
}

function hasPendingSaveChanges() {
  return hasUnsavedChanges() || !!state.localOnlyChanges;
}

function canSaveCurrentGame() {
  if (state.saveUiState === 'saving' || state.saveUiState === 'loading') return false;
  return hasPendingSaveChanges() || shouldStageCurrentGameForSave();
}

function canPlayCurrentGame() {
  if (state.saveUiState === 'saving' || state.saveUiState === 'loading') return false;
  return hasGameNode();
}

function updateActionUi() {
  const isSaveBusy = state.saveUiState === 'saving' || state.saveUiState === 'loading';
  const canSave = canSaveCurrentGame();
  const canPlay = canPlayCurrentGame();
  if (saveGameBtn) saveGameBtn.disabled = isSaveBusy || !canSave;
  if (gamePickerSaveBtn) {
    gamePickerSaveBtn.disabled = !canSave;
    gamePickerSaveBtn.dataset.state = isSaveBusy ? 'saving' : (canSave ? 'dirty' : 'idle');
    gamePickerSaveBtn.textContent = 'Save';
    gamePickerSaveBtn.title = 'Save (Ctrl+S)';
    gamePickerSaveBtn.setAttribute('aria-label', 'Save (Ctrl+S)');
    gamePickerSaveBtn.setAttribute('aria-busy', isSaveBusy ? 'true' : 'false');
  }
  if (gamePickerPlayBtn) {
    gamePickerPlayBtn.disabled = !canPlay;
    gamePickerPlayBtn.setAttribute('aria-disabled', canPlay ? 'false' : 'true');
    gamePickerPlayBtn.title = canPlay ? 'Preview' : 'Choose a game to preview';
  }
  if (gamePickerSelect) gamePickerSelect.disabled = isSaveBusy;
}

function isRefreshShortcut(event) {
  const key = (event.key || '').toLowerCase();
  return event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r');
}

function isLetterShortcut(event, code) {
  return !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && event.code === code;
}

function closeNodeContextMenu() {
  if (nodeContextMenu && !nodeContextMenu.hidden) {
    nodeContextMenu.hidden = true;
    state.contextMenuNodeId = null;
    state.contextMenuLinkId = null;
  }
  closeWaypointLibraryContextMenu();
}

function closeWaypointLibraryContextMenu() {
  if (!waypointLibraryContextMenu || waypointLibraryContextMenu.hidden) return;
  waypointLibraryContextMenu.hidden = true;
  state.waypointLibraryContextEntryId = null;
}

function closeAllContextMenus() {
  closeNodeContextMenu();
  closeWaypointLibraryContextMenu();
}

function openNodeContextMenu(nodeId, clientX, clientY) {
  if (!nodeContextMenu) return;

  const node = getNode(nodeId);
  if (!node) return;

  closeWaypointLibraryContextMenu();
  state.contextMenuNodeId = nodeId;
  state.contextMenuLinkId = null;
  if (duplicateNodeBtn) duplicateNodeBtn.disabled = node.type === 'game';
  if (duplicateNodeBtn) duplicateNodeBtn.hidden = false;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.disabled = false;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.textContent = node.type === 'stop' ? 'Erase...' : 'Erase';
  nodeContextMenu.hidden = false;
  nodeContextMenu.style.left = '0px';
  nodeContextMenu.style.top = '0px';

  const margin = 10;
  const menuWidth = nodeContextMenu.offsetWidth || 160;
  const menuHeight = nodeContextMenu.offsetHeight || 96;
  const left = Math.min(clientX, window.innerWidth - menuWidth - margin);
  const top = Math.min(clientY, window.innerHeight - menuHeight - margin);
  nodeContextMenu.style.left = Math.max(margin, left) + 'px';
  nodeContextMenu.style.top = Math.max(margin, top) + 'px';
}

function openWaypointLibraryContextMenu(entryId, clientX, clientY) {
  if (!waypointLibraryContextMenu || !waypointLibraryOpenGameBtn) return;
  const entry = getWaypointLibraryEntry(entryId);
  if (!entry) return;

  closeNodeContextMenu();
  state.waypointLibraryContextEntryId = entry.id;
  waypointLibraryOpenGameBtn.disabled = !String(entry.sourceGameId || '').trim() || entry.sourceGameId === state.currentGameId;
  waypointLibraryContextMenu.hidden = false;
  waypointLibraryContextMenu.style.left = '0px';
  waypointLibraryContextMenu.style.top = '0px';

  const margin = 10;
  const menuWidth = waypointLibraryContextMenu.offsetWidth || 180;
  const menuHeight = waypointLibraryContextMenu.offsetHeight || 62;
  const left = Math.min(clientX, window.innerWidth - menuWidth - margin);
  const top = Math.min(clientY, window.innerHeight - menuHeight - margin);
  waypointLibraryContextMenu.style.left = Math.max(margin, left) + 'px';
  waypointLibraryContextMenu.style.top = Math.max(margin, top) + 'px';
}


function reloadPage() {
  location.reload();
}

function attemptRefresh() {
  if (hasPendingSaveChanges()) syncRecoveryDraftNow({ updateStatus: false });
  reloadPage();
}

function requestOpenSavedGame(gameId, returnFocusEl = null) {
  const nextGameId = String(gameId || '').trim();
  if (!nextGameId || nextGameId === state.currentGameId) return;
  const preserveRecovery = hasPendingSaveChanges();
  void openSavedGameById(nextGameId, { preserveRecovery });
}

function closeMenuForButton(button) {
  if (!button) return;
  const menu = button.closest('.mb-menu');
  const panel = button.closest('.mb-panel');
  if (menu) menu.classList.remove('open');
  if (panel) panel.hidden = true;
}

async function saveCurrentGameFromMenu() {
  closeMenuForButton(saveGameBtn);
  await saveDoc();
}


function buildDuplicateGameName(baseName = 'Untitled Game') {
  const sourceName = String(baseName || 'Untitled Game').trim() || 'Untitled Game';
  const nameSources = [
    ...(state.store.games || []),
    ...(state.headerGames || [])
  ];
  const currentGame = getCurrentHeaderGameEntry();
  if (currentGame) nameSources.push(currentGame);
  const names = new Set(nameSources.map((game) => String(game && game.name || '').trim().toLowerCase()).filter(Boolean));
  const firstCandidate = sourceName + ' Copy';
  if (!names.has(firstCandidate.toLowerCase())) return firstCandidate;
  let copyIndex = 2;
  while (names.has((sourceName + ' Copy ' + copyIndex).toLowerCase())) {
    copyIndex += 1;
  }
  return sourceName + ' Copy ' + copyIndex;
}

function deriveSavedGameColors(game, index = 0) {
  if (game && game.id === 'draft-game') {
    return {
      primaryColor: '#ffffff',
      secondaryColor: '#243256'
    };
  }
  const seed = String(game && game.id || game && game.name || index);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const secondaryHue = (hue + 28 + (index * 11)) % 360;
  return {
    primaryColor: `hsl(${hue} 52% 44%)`,
    secondaryColor: `hsl(${secondaryHue} 58% 26%)`
  };
}

function getSupportedColorValue(rawValue) {
  if (typeof rawValue !== 'string') return '';
  const value = rawValue.trim();
  if (!value) return '';
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return value;
  return CSS.supports('color', value) ? value : '';
}

function normalizeSavedGameColor(rawValue, fallback) {
  return getSupportedColorValue(rawValue) || fallback;
}

function getSavedGameColors(game, index = 0) {
  const fallback = deriveSavedGameColors(game, index);
  return {
    primaryColor: normalizeSavedGameColor(game && game.primaryColor, fallback.primaryColor),
    secondaryColor: normalizeSavedGameColor(game && game.secondaryColor, fallback.secondaryColor)
  };
}

function getCurrentGameColorFallback() {
  const existingIndex = state.store.games.findIndex((game) => game.id === state.currentGameId);
  const fallbackGame = existingIndex >= 0
    ? state.store.games[existingIndex]
    : { id: state.currentGameId || 'draft-game', name: getDocName() };
  return getSavedGameColors(
    fallbackGame,
    existingIndex >= 0 ? existingIndex : state.store.games.length
  );
}

function getCurrentGameColors() {
  const fallback = getCurrentGameColorFallback();
  return {
    primaryColor: normalizeSavedGameColor(state.currentGameColors && state.currentGameColors.primaryColor, fallback.primaryColor),
    secondaryColor: normalizeSavedGameColor(state.currentGameColors && state.currentGameColors.secondaryColor, fallback.secondaryColor)
  };
}

function setCurrentGameColors(nextColors = null) {
  const incoming = nextColors && typeof nextColors === 'object' ? nextColors : {};
  const fallback = getCurrentGameColorFallback();
  const primaryColor = normalizeSavedGameColor(incoming.primaryColor, fallback.primaryColor);
  const secondaryColor = normalizeSavedGameColor(incoming.secondaryColor, fallback.secondaryColor);
  state.currentGameColors = {
    primaryColor,
    secondaryColor
  };
  return state.currentGameColors;
}

function setCurrentGameColorValue(key, rawValue) {
  if (key !== 'primaryColor' && key !== 'secondaryColor') return false;
  const currentColors = getCurrentGameColors();
  const nextValue = normalizeSavedGameColor(rawValue, currentColors[key]);
  if (currentColors[key] === nextValue) return false;
  state.currentGameColors = {
    ...currentColors,
    [key]: nextValue
  };
  return true;
}

function colorValueToHex(rawValue, fallback = '#5468a7') {
  const color = getSupportedColorValue(rawValue) || getSupportedColorValue(fallback) || '#5468a7';
  if (typeof document === 'undefined' || !document.body) {
    return color.startsWith('#') ? color : fallback;
  }

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const match = resolved.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return color.startsWith('#') ? color : fallback;
  }

  const [r, g, b] = match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Math.max(0, Math.min(255, Math.round(Number.parseFloat(part.trim()) || 0))));

  return '#' + [r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function colorValueToRgba(rawValue, alpha = 1, fallback = '#5468a7') {
  const hex = colorValueToHex(rawValue, fallback);
  const normalized = hex.startsWith('#') ? hex.slice(1) : '5468a7';
  const safeHex = (normalized.length === 3
    ? normalized.split('').map((value) => value + value).join('')
    : normalized.padEnd(6, '0')).slice(0, 6);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(safeHex.slice(offset, offset + 2), 16) || 0);
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${clampedAlpha})`;
}

function getTertiaryGameColor(rawValue, fallback = '#5468a7') {
  const hex = colorValueToHex(rawValue, fallback);
  const normalized = hex.startsWith('#') ? hex.slice(1) : '5468a7';
  const safeHex = (normalized.length === 3
    ? normalized.split('').map((value) => value + value).join('')
    : normalized.padEnd(6, '0')).slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(safeHex.slice(offset, offset + 2), 16) || 0);
  const distanceToBlack = (r * r) + (g * g) + (b * b);
  const distanceToWhite = ((255 - r) * (255 - r)) + ((255 - g) * (255 - g)) + ((255 - b) * (255 - b));
  return distanceToBlack >= distanceToWhite ? 'BLACK' : 'WHITE';
}

function isBlackOrWhite(colorValue) {
  const v = (colorValue || '').trim().toLowerCase();
  if (v === 'black' || v === '#000' || v === '#000000') return 'black';
  if (v === 'white' || v === '#fff' || v === '#ffffff') return 'white';
  return null;
}

function getEffectiveTertiary(primaryColor, secondaryColor) {
  const primaryBW = isBlackOrWhite(primaryColor);
  if (primaryBW) return primaryBW === 'black' ? 'WHITE' : 'BLACK';
  const secondaryBW = isBlackOrWhite(secondaryColor);
  if (secondaryBW) return secondaryBW === 'black' ? 'WHITE' : 'BLACK';
  return getTertiaryGameColor(primaryColor);
}

function applyGameshelfButtonColors(button, colors = null) {
  if (!button) return;
  const primaryColor = colors && colors.primaryColor ? colors.primaryColor : '#5468a7';
  const secondaryColor = colors && colors.secondaryColor ? colors.secondaryColor : '#243256';
  const tertiaryColor = getEffectiveTertiary(primaryColor, secondaryColor);
  button.style.setProperty('--gameshelf-glow', 'rgba(224, 224, 224, 0.65)');
  button.style.setProperty('--gameshelf-title-color', primaryColor);
  button.style.setProperty('--gameshelf-title-outline', tertiaryColor);
}

function getGameshelfSourceGameSnapshot(gameId) {
  const sourceGame = state.store.games.find((entry) => entry.id === gameId);
  if (!sourceGame) return null;
  const sourceIndex = state.store.games.findIndex((entry) => entry.id === gameId);
  const isCurrent = gameId === state.currentGameId;
  const colors = isCurrent ? getCurrentGameColors() : getSavedGameColors(sourceGame, sourceIndex);
  return {
    sourceGame,
    isCurrent,
    colors,
    name: isCurrent ? getDocName() : (sourceGame.name || 'Untitled Game'),
    nodes: cloneObj(isCurrent ? state.doc.nodes : sourceGame.nodes),
    links: cloneObj(isCurrent ? state.doc.links : sourceGame.links)
  };
}

async function duplicateSavedGame(gameId) {
  const snapshot = getGameshelfSourceGameSnapshot(gameId);
  if (!snapshot) return null;

  const timestamp = new Date().toISOString();
  const duplicatedGame = {
    id: await makeUniqueGameId(),
    name: buildDuplicateGameName(snapshot.name),
    createdAt: timestamp,
    updatedAt: timestamp,
    primaryColor: snapshot.colors.primaryColor,
    secondaryColor: snapshot.colors.secondaryColor,
    featured: '',
    nodes: snapshot.nodes,
    links: snapshot.links
  };

  state.store.updatedAt = timestamp;
  state.store.games.push(duplicatedGame);
  upsertHeaderGame(duplicatedGame);
  syncAllTagsFromStore();
  renderGameshelf();
  persistStoreLocally();
  state.localOnlyChanges = true;
  syncRecoveryDraftNow({ updateStatus: false });
  updateActionUi();
  setSaveStatus('local');
  return duplicatedGame;
}

async function deleteSavedGame(gameId) {
  const targetIndex = state.store.games.findIndex((entry) => entry.id === gameId);
  if (targetIndex < 0) return false;
  const isCurrent = gameId === state.currentGameId;

  state.store.games.splice(targetIndex, 1);
  state.store.updatedAt = new Date().toISOString();
  if (isCurrent) state.currentGameId = null;
  removeHeaderGame(gameId);
  syncAllTagsFromStore();
  renderGameshelf();
  persistStoreLocally();
  state.localOnlyChanges = true;
  syncRecoveryDraftNow({ updateStatus: false });
  updateActionUi();
  if (isCurrent) renderAll();
  setSaveStatus('local');
  return true;
}

function upsertStoredGame(game) {
  if (!game || !game.id) return null;
  const normalizedGame = normalizeSavedGame(game, 0);
  const existingIndex = state.store.games.findIndex((entry) => entry && entry.id === normalizedGame.id);
  if (existingIndex >= 0) state.store.games[existingIndex] = normalizedGame;
  else state.store.games.push(normalizedGame);
  state.store.updatedAt = normalizedGame.updatedAt || new Date().toISOString();
  upsertHeaderGame(normalizedGame);
  syncAllTagsFromStore();
  persistStoreLocally();
  return normalizedGame;
}

function setDuplicateGameFeedback(message = '', options = {}) {
  state.duplicateGameFeedback = typeof message === 'string' ? message.trim() : '';
  if (duplicateGameFeedbackTimer) {
    window.clearTimeout(duplicateGameFeedbackTimer);
    duplicateGameFeedbackTimer = 0;
  }
  updateSelectionUi();
  if (!state.duplicateGameFeedback) return;
  const duration = Math.max(0, Number(options.durationMs) || 2600);
  duplicateGameFeedbackTimer = window.setTimeout(() => {
    duplicateGameFeedbackTimer = 0;
    state.duplicateGameFeedback = '';
    updateSelectionUi();
  }, duration);
}

function showDuplicateGameError(message, error) {
  const detail = error && typeof error.message === 'string' && error.message.trim()
    ? '\n\n' + error.message.trim()
    : '';
  window.alert(message + detail);
}

function getCurrentGameArchiveEntry() {
  if (state.currentGameId) {
    const storedGame = state.store.games.find((entry) => entry && entry.id === state.currentGameId);
    if (storedGame) return storedGame;
  }
  return getCurrentHeaderGameEntry();
}

function isCurrentGameArchived() {
  return normalizeArchivedFlag(getCurrentGameArchiveEntry()?.archived) === ARCHIVED_GAME_VALUE;
}

function isCurrentGameFeatured() {
  const gameNode = getGameNode();
  const tags = Array.isArray(gameNode && gameNode.tags) ? gameNode.tags : [];
  return tags.some((tag) => String(tag || '').trim().toLowerCase() === FEATURED_TAG.toLowerCase());
}

function setArchiveGameFeedback(kind = '', options = {}) {
  const nextKind = String(kind || '').trim().toLowerCase();
  state.archiveGameFeedback = nextKind === 'archived' || nextKind === 'unarchived' ? nextKind : '';
  if (archiveGameFeedbackTimer) {
    window.clearTimeout(archiveGameFeedbackTimer);
    archiveGameFeedbackTimer = 0;
  }
  updateSelectionUi();
  if (!state.archiveGameFeedback) return;
  const duration = Math.max(0, Number(options.durationMs) || 2600);
  archiveGameFeedbackTimer = window.setTimeout(() => {
    archiveGameFeedbackTimer = 0;
    state.archiveGameFeedback = '';
    updateSelectionUi();
  }, duration);
}

function setFeatureGameFeedback(kind = '', options = {}) {
  const nextKind = String(kind || '').trim().toLowerCase();
  state.featureGameFeedback = nextKind === 'featured' || nextKind === 'unfeatured' ? nextKind : '';
  if (state.featureGameFeedbackTimer) {
    window.clearTimeout(state.featureGameFeedbackTimer);
    state.featureGameFeedbackTimer = 0;
  }
  updateSelectionUi();
  if (!state.featureGameFeedback) return;
  const duration = Math.max(0, Number(options.durationMs) || 2600);
  state.featureGameFeedbackTimer = window.setTimeout(() => {
    state.featureGameFeedbackTimer = 0;
    state.featureGameFeedback = '';
    updateSelectionUi();
  }, duration);
}

function showFeatureGameError(message, error) {
  const detail = error && typeof error.message === 'string' && error.message.trim()
    ? '\n\n' + error.message.trim()
    : '';
  window.alert(message + detail);
}

function showArchiveGameError(message, error) {
  const detail = error && typeof error.message === 'string' && error.message.trim()
    ? '\n\n' + error.message.trim()
    : '';
  window.alert(message + detail);
}

async function toggleCurrentGameArchiveState() {
  if (state.archiveGameActionBusy || !getCurrentGameArchiveEntry()) return false;
  if (!hasSupabaseStore()) {
    showArchiveGameError('Could not update this game in the database.', new Error('Supabase is not configured.'));
    return false;
  }

  const wasArchived = isCurrentGameArchived();
  state.archiveGameActionBusy = true;
  setDuplicateGameFeedback('');
  setArchiveGameFeedback('');
  updateSelectionUi();

  try {
    const saveResult = await saveDoc({ silent: true });
    if (!saveResult || saveResult.error) {
      showArchiveGameError(
        'Could not update this game in the database.',
        saveResult && saveResult.error ? saveResult.error : new Error('This game could not be saved to Supabase first.')
      );
      return false;
    }

    const targetId = String((saveResult.savedGame && saveResult.savedGame.id) || state.currentGameId || '').trim();
    if (!targetId) {
      showArchiveGameError('Could not update this game in the database.', new Error('No saved game is available to update.'));
      return false;
    }

    const updateResult = wasArchived
      ? await unarchiveGameInSupabase(targetId)
      : await archiveGameInSupabase(targetId);

    if (!updateResult.serverSaved) {
      showArchiveGameError('Could not update this game in the database.', updateResult.error);
      return false;
    }

    const existingSavedGame = state.store.games.find((entry) => entry && entry.id === targetId)
      || getCurrentHeaderGameEntry()
      || { id: targetId };
    const savedGame = updateResult.savedGame || normalizeSavedGame({
      ...existingSavedGame,
      id: targetId,
      archived: wasArchived ? '' : ARCHIVED_GAME_VALUE,
      erased: existingSavedGame.erased || '',
      updatedAt: new Date().toISOString()
    }, 0);

    state.localOnlyChanges = false;
    upsertStoredGame(savedGame);
    if (wasArchived) {
      openSavedGame(savedGame.id);
    }
    setArchiveGameFeedback(wasArchived ? 'unarchived' : 'archived');
    return true;
  } finally {
    state.archiveGameActionBusy = false;
    updateSelectionUi();
  }
}

async function toggleCurrentGameFeaturedState() {
  if (state.featureGameActionBusy || !getCurrentGameArchiveEntry()) return false;
  const gameNode = getGameNode();
  if (!gameNode || gameNode.type !== 'game') return false;
  const wasFeatured = isCurrentGameFeatured();
  state.featureGameActionBusy = true;
  setDuplicateGameFeedback('');
  setArchiveGameFeedback('');
  setFeatureGameFeedback('');
  updateSelectionUi();

  try {
    const nextTags = Array.isArray(gameNode.tags) ? [...gameNode.tags] : [];
    const filteredTags = nextTags.filter((tag) => String(tag || '').trim().toLowerCase() !== FEATURED_TAG.toLowerCase());
    gameNode.tags = wasFeatured ? filteredTags : [...filteredTags, FEATURED_TAG];
    renderTagPicker(gameNode);
    const saveResult = await saveDoc({ silent: true });
    if (!saveResult || saveResult.localOnly) {
      showFeatureGameError(
        'Could not update the featured tag.',
        saveResult && saveResult.error ? saveResult.error : new Error('This game could not be saved.')
      );
      return false;
    }
    setFeatureGameFeedback(wasFeatured ? 'unfeatured' : 'featured');
    return true;
  } finally {
    state.featureGameActionBusy = false;
    updateSelectionUi();
  }
}

async function duplicateCurrentGameAndOpen() {
  if (state.duplicateGameActionBusy || !getCurrentHeaderGameEntry()) return null;
  if (!hasSupabaseStore()) {
    showDuplicateGameError('Could not duplicate this game in the database.', new Error('Supabase is not configured.'));
    return null;
  }

  state.duplicateGameActionBusy = true;
  setArchiveGameFeedback('');
  setDuplicateGameFeedback('');
  updateSelectionUi();

  try {
    const saveResult = await saveDoc({ silent: true });
    if (!saveResult || saveResult.localOnly) {
      showDuplicateGameError(
        'Could not duplicate this game in the database.',
        saveResult && saveResult.error ? saveResult.error : new Error('This game could not be saved to Supabase first.')
      );
      return null;
    }

    const sourceId = String((saveResult.savedGame && saveResult.savedGame.id) || state.currentGameId || '').trim();
    const snapshot = getGameshelfSourceGameSnapshot(sourceId);
    if (!snapshot) {
      showDuplicateGameError('Could not duplicate this game in the database.', new Error('No saved source game is available to copy.'));
      return null;
    }

    const timestamp = new Date().toISOString();
    const duplicateDraft = normalizeSavedGame({
      id: await makeUniqueGameId(),
      name: buildDuplicateGameName(snapshot.name),
      createdAt: timestamp,
      updatedAt: timestamp,
      primaryColor: snapshot.colors.primaryColor,
      secondaryColor: snapshot.colors.secondaryColor,
      featured: '',
      archived: '',
      erased: '',
      nodes: snapshot.nodes,
      links: snapshot.links
    }, 0);

    const createResult = await createGameInSupabase(duplicateDraft);
    if (!createResult.serverSaved) {
      showDuplicateGameError('Could not duplicate this game in the database.', createResult.error);
      return null;
    }

    const duplicatedGame = createResult.savedGame || duplicateDraft;
    state.localOnlyChanges = false;
    upsertStoredGame(duplicatedGame);
    openSavedGame(duplicatedGame.id);
    setDuplicateGameFeedback(`Opened "${duplicatedGame.name || 'Untitled Game'}".`);
    return duplicatedGame;
  } finally {
    state.duplicateGameActionBusy = false;
    updateSelectionUi();
  }
}

function isGameEraseDialogOpen() {
  return !!(gameEraseBackdrop && !gameEraseBackdrop.hidden);
}

function closeGameEraseDialog(action = '') {
  if (!gameEraseBackdrop || gameEraseBackdrop.hidden) return;
  const resolver = state.gameEraseDialogResolver;
  const previousFocus = state.gameEraseDialogPreviousFocus;
  state.gameEraseDialogResolver = null;
  state.gameEraseDialogPreviousFocus = null;
  gameEraseBackdrop.hidden = true;
  document.body.classList.remove('erase-note-open');
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch (error) {
      previousFocus.focus();
    }
  }
  if (typeof resolver === 'function') resolver(action);
}

function openGameEraseDialog() {
  if (!gameEraseBackdrop || !gameEraseConfirmBtn || !gameArchiveConfirmBtn || !gameEraseCancelBtn) {
    return Promise.resolve('');
  }
  if (state.gameEraseDialogResolver) closeGameEraseDialog('');
  state.gameEraseDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  gameEraseBackdrop.hidden = false;
  document.body.classList.add('erase-note-open');
  requestAnimationFrame(() => {
    try {
      gameEraseCancelBtn.focus({ preventScroll: true });
    } catch (error) {
      gameEraseCancelBtn.focus();
    }
  });
  return new Promise((resolve) => {
    state.gameEraseDialogResolver = resolve;
  });
}

function isWaypointEraseDialogOpen() {
  return !!(waypointEraseBackdrop && !waypointEraseBackdrop.hidden);
}

function closeWaypointEraseDialog(action = '') {
  if (!waypointEraseBackdrop || waypointEraseBackdrop.hidden) return;
  const resolver = state.waypointEraseDialogResolver;
  const previousFocus = state.waypointEraseDialogPreviousFocus;
  state.waypointEraseDialogResolver = null;
  state.waypointEraseDialogPreviousFocus = null;
  waypointEraseBackdrop.hidden = true;
  document.body.classList.remove('erase-note-open');
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch (error) {
      previousFocus.focus();
    }
  }
  if (typeof resolver === 'function') resolver(action);
}

function openWaypointEraseDialog() {
  if (!waypointEraseBackdrop || !waypointEraseOnlyBtn || !waypointEraseBundleBtn || !waypointEraseCancelBtn) {
    return Promise.resolve('');
  }
  if (state.waypointEraseDialogResolver) closeWaypointEraseDialog('');
  state.waypointEraseDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  waypointEraseBackdrop.hidden = false;
  document.body.classList.add('erase-note-open');
  requestAnimationFrame(() => {
    try {
      waypointEraseCancelBtn.focus({ preventScroll: true });
    } catch (error) {
      waypointEraseCancelBtn.focus();
    }
  });
  return new Promise((resolve) => {
    state.waypointEraseDialogResolver = resolve;
  });
}

function showGameEraseActionError(message, error) {
  const detail = error && typeof error.message === 'string' && error.message.trim()
    ? '\n\n' + error.message.trim()
    : '';
  window.alert(message + detail);
}

async function applyCurrentGameDisposition(action) {
  if (state.gameEraseActionBusy) return false;
  const nextAction = String(action || '').trim().toLowerCase();
  if (nextAction !== 'erase' && nextAction !== 'archive') return false;

  state.gameEraseActionBusy = true;
  updateSelectionUi();

  try {
    const saveResult = await saveDoc({ silent: true });
    if (!saveResult || saveResult.localOnly) {
      showGameEraseActionError(
        nextAction === 'erase'
          ? 'Could not erase this game in the database.'
          : 'Could not archive this game in the database.',
        saveResult && saveResult.error ? saveResult.error : new Error('This game could not be saved to Supabase first.')
      );
      return false;
    }

    const targetId = String((saveResult.savedGame && saveResult.savedGame.id) || state.currentGameId || '').trim();
    if (!targetId) {
      showGameEraseActionError(
        nextAction === 'erase'
          ? 'Could not erase this game in the database.'
          : 'Could not archive this game in the database.',
        new Error('No saved game is available to update.')
      );
      return false;
    }

    const updateResult = nextAction === 'erase'
      ? await eraseGameInSupabase(targetId)
      : await archiveGameInSupabase(targetId);

    if (!updateResult.serverSaved) {
      showGameEraseActionError(
        nextAction === 'erase'
          ? 'Could not erase this game in the database.'
          : 'Could not archive this game in the database.',
        updateResult.error
      );
      return false;
    }

    const existingSavedGame = state.store.games.find((entry) => entry && entry.id === targetId)
      || getCurrentHeaderGameEntry()
      || { id: targetId };
    const savedGame = updateResult.savedGame || normalizeSavedGame({
      ...existingSavedGame,
      id: targetId,
      archived: nextAction === 'archive' ? ARCHIVED_GAME_VALUE : (existingSavedGame.archived || ''),
      erased: nextAction === 'erase' ? ERASED_GAME_VALUE : (existingSavedGame.erased || ''),
      updatedAt: new Date().toISOString()
    }, 0);

    upsertStoredGame(savedGame);
    state.localOnlyChanges = false;
    startNewPhone();
    return true;
  } finally {
    state.gameEraseActionBusy = false;
    updateSelectionUi();
  }
}

async function openGameEraseFlow() {
  if (state.gameEraseActionBusy || !getCurrentGameArchiveEntry()) return false;
  const action = await openGameEraseDialog();
  if (!action) return false;
  return applyCurrentGameDisposition(action);
}

function normalizeSavedGame(raw, index) {
  const doc = normalizeDoc(raw);
  const createdAt = typeof (raw && raw.createdAt) === 'string' && raw.createdAt
    ? raw.createdAt
    : (typeof (raw && raw.updatedAt) === 'string' ? raw.updatedAt : doc.updatedAt);
  const colors = getSavedGameColors(raw, index);
  return {
    id: raw && raw.id ? String(raw.id) : 'game-' + (index + 1),
    name: raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : getDocName(doc),
    city: raw && typeof raw.city === 'string'
      ? raw.city
      : (() => {
          const gameNode = doc.nodes.find((node) => node && node.type === 'game');
          return gameNode && typeof gameNode.city === 'string' ? gameNode.city : '';
        })(),
    createdAt,
    updatedAt: typeof (raw && raw.updatedAt) === 'string' ? raw.updatedAt : doc.updatedAt,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    featured: normalizeFeaturedFlag(raw && raw.featured) === FEATURED_GAME_VALUE
      ? FEATURED_GAME_VALUE
      : getFeaturedFlagFromNodes(doc.nodes),
    archived: normalizeArchivedFlag(raw && raw.archived) === ARCHIVED_GAME_VALUE ? ARCHIVED_GAME_VALUE : '',
    erased: normalizeErasedFlag(raw && raw.erased) === ERASED_GAME_VALUE ? ERASED_GAME_VALUE : '',
    nodes: doc.nodes,
    links: doc.links
  };
}

function normalizeStore(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  let games = [];

  if (Array.isArray(incoming.games)) {
    games = incoming.games.map(normalizeSavedGame);
  } else if (Array.isArray(incoming.nodes) || Array.isArray(incoming.links)) {
    games = [normalizeSavedGame(incoming, 0)];
  }

  return {
    _comment: STORE_COMMENT,
    updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : '',
    games
  };
}

function createNode(type, x, y) {
  const config = TYPE_CONFIG[type];
  const id = makeId(type);
  const nextOrderIndex = state.doc.nodes.reduce((maxOrderIndex, node) => {
    const value = normalizeNodeOrderIndex(node && node.orderIndex);
    return value == null ? maxOrderIndex : Math.max(maxOrderIndex, value);
  }, 0) + 100;
  return {
    id,
    type,
    x: snap(x),
    y: snap(y),
    width: config.width,
    height: config.height,
    title: getDefaultNodeTitle(type, id),
    tagline: type === 'game' ? 'Shall We Play A Game?' : '',
    featured: '',
    city: '',
    startingLocation: type === 'game' ? 'https://w3w.co/wizard.brother.sediment' : '',
    howToPlay: '',
    guideName: type === 'game' ? 'Mission Control' : '',
    guideBio: '',
    guideImageUrl: '',
    logoUrl: '',
    price: type === 'game' ? 'Free To Start / In App Purchases' : '',
    builderNotes: '',
    tags: [],
    teams: [],
    waypointGroup: '',
    body: config.body,
    buttonUrl: '',
    tertiaryColor: '#FFFFFF',
    quaternaryColor: '',
    varName: '',
    acceptAny: false,
    anytime: false,
    anytimePairId: '',
    rotation: 0,
    orderIndex: nextOrderIndex,
    kind: ''
  };
}

function syncAllTagsFromStore() {
  const base = [...ALL_TAGS, ...supabaseTags];
  allTags = base;
  const lowerSet = new Set(allTags.map(t => t.toLowerCase()));
  const newTags = [];

  const collectTags = (doc) => {
    doc.nodes.forEach((node) => {
      (node.tags || []).forEach((tag) => {
        if (tag && !lowerSet.has(tag.toLowerCase())) {
          lowerSet.add(tag.toLowerCase());
          allTags.push(tag);
          newTags.push(tag);
        }
      });
    });
  };

  state.store.games.forEach((game) => {
    collectTags(game);
  });

  collectTags(state.doc);
  allTags.sort((a, b) => a.localeCompare(b));

  // Persist any tags found in game nodes that aren't yet in supabaseTags
  newTags.forEach((tag) => {
    supabaseTags.push(tag);
    saveNewTagToSupabase(tag).catch(err => console.warn('Failed to sync tag to Supabase:', err));
  });
}

function formatSavedGameLabel(game) {
  if (!game.updatedAt) return game.name;

  try {
    const when = new Date(game.updatedAt);
    if (Number.isNaN(when.getTime())) return game.name;
    return game.name + ' | ' + when.toLocaleString();
  } catch (error) {
    return game.name;
  }
}

function formatSavedGameshelfDate(game) {
  const source = game && (game.updatedAt || game.createdAt);
  if (!source) return 'Saved earlier';
  try {
    const when = new Date(source);
    if (Number.isNaN(when.getTime())) return 'Saved earlier';
    return 'Saved ' + when.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return 'Saved earlier';
  }
}

function getSavedGameBubbleCount(game) {
  if (!game || !Array.isArray(game.nodes)) return 0;
  return game.nodes.filter((node) => node && (node.type === 'bubble' || node.type === 'reply')).length;
}

function getGameshelfGames() {
  const games = [...(state.store.games || [])].filter((game) => normalizeErasedFlag(game && game.erased) !== ERASED_GAME_VALUE);
  return games.sort((a, b) => compareSavedGamesAlphabetical(a, b));
}

function getGameshelfLoopCount(games) {
  if (!Array.isArray(games) || games.length <= 1) return 1;
  return Math.max(3, Math.ceil(GAMESHELF_MIN_RENDER_CARDS / games.length));
}

function measureGameshelfLoopHeight() {
  if (!gameshelfList) return 0;
  const originals = [...gameshelfList.querySelectorAll('.gameshelf-slot[data-loop-index="0"]')];
  if (!originals.length) return 0;
  const first = originals[0];
  const nextLoopFirst = gameshelfList.querySelector('.gameshelf-slot[data-loop-index="1"]');
  if (nextLoopFirst) {
    return Math.max(0, Math.round(nextLoopFirst.offsetTop - first.offsetTop));
  }
  const last = originals[originals.length - 1];
  return Math.max(0, Math.round((last.offsetTop - first.offsetTop) + last.offsetHeight));
}

function stopGameshelfAutoScroll(resetScroll = true) {
  if (gameshelfAutoScrollFrame) {
    window.cancelAnimationFrame(gameshelfAutoScrollFrame);
    gameshelfAutoScrollFrame = 0;
  }
  gameshelfAutoScrollLastTime = 0;
  gameshelfLoopHeight = 0;
  if (resetScroll && gameshelfStream) {
    gameshelfStream.scrollTop = 0;
  }
}

function resetHomeScrollPositions() {
  if (gameshelfStream) gameshelfStream.scrollTop = 0;
  setViewportScrollPosition(0, 0);
}

function scheduleInitialScrollReset() {
  if (state.initialScrollResetDone) return;
  state.initialScrollResetDone = true;
  window.requestAnimationFrame(() => {
    resetHomeScrollPositions();
    window.requestAnimationFrame(() => {
      resetHomeScrollPositions();
    });
  });
}

function shouldPauseGameshelfAutoScroll() {
  return !gameshelfStream
    || (!!gameshelf && gameshelf.contains(document.activeElement));
}

function stepGameshelfAutoScroll(timestamp) {
  if (!gameshelfStream || !gameshelfLoopHeight) {
    stopGameshelfAutoScroll(false);
    return;
  }

  if (!gameshelfAutoScrollLastTime) {
    gameshelfAutoScrollLastTime = timestamp;
  }

  const delta = Math.min(40, timestamp - gameshelfAutoScrollLastTime);
  gameshelfAutoScrollLastTime = timestamp;

  if (!shouldPauseGameshelfAutoScroll()) {
    gameshelfStream.scrollTop += delta * (GAMESHELF_AUTO_SCROLL_SPEED / 1000);
    while (gameshelfStream.scrollTop >= gameshelfLoopHeight) {
      gameshelfStream.scrollTop -= gameshelfLoopHeight;
    }
  }

  gameshelfAutoScrollFrame = window.requestAnimationFrame(stepGameshelfAutoScroll);
}

function refreshGameshelfAutoScroll() {
  if (!gameshelfStream || !gameshelfList) return;
  stopGameshelfAutoScroll(false);
}

// Drag-to-scroll on gameshelf
let gsDrag = false;
let gsDragStartY = 0;
let gsDragScrollTop = 0;
let gsDragWasScrolling = false;

if (gameshelfStream) {
  gameshelfStream.addEventListener('mousedown', e => {
    if (usesSingleSheetScroll()) return;
    if (e.button !== 0) return;
    gsDrag = true;
    gsDragStartY = e.clientY;
    gsDragScrollTop = gameshelfStream.scrollTop;
    gsDragWasScrolling = !!gameshelfAutoScrollFrame;
    if (gsDragWasScrolling) stopGameshelfAutoScroll(false);
    gameshelfStream.style.cursor = 'grabbing';
    e.preventDefault();
  });
}

window.addEventListener('mousemove', e => {
  if (usesSingleSheetScroll()) return;
  if (!gsDrag) return;
  gameshelfStream.scrollTop = gsDragScrollTop + (gsDragStartY - e.clientY);
});

window.addEventListener('mouseup', () => {
  if (usesSingleSheetScroll()) return;
  if (!gsDrag) return;
  gsDrag = false;
  if (gameshelfStream) gameshelfStream.style.cursor = '';
  if (gsDragWasScrolling) refreshGameshelfAutoScroll();
});

function buildNowPlayingBadgeMarkup() {
  return '<span class="gameshelf-game-badge">Now Playing</span>';
}

function startNewPhone() {
  const preserveRecovery = hasPendingSaveChanges();
  if (preserveRecovery) syncRecoveryDraftNow({ updateStatus: false });
  clearEditorLaunchIntent();
  seedPhone({ preserveRecovery });
  return true;
}

function buildNewGameShelfButton(showNowPlayingBadge = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gameshelf-game gameshelf-game--new';
  applyGameshelfButtonColors(button);
  button.innerHTML = `
    ${showNowPlayingBadge ? buildNowPlayingBadgeMarkup() : ''}
    <span class="gameshelf-game-status">+ CREATE</span>
    <span class="gameshelf-game-title">New Game</span>
    <span class="gameshelf-game-meta">Start from scratch</span>
  `;
  button.addEventListener('click', () => startNewPhone());
  return button;
}

function renderGameshelfPinned() {
  if (!gameshelfPinned) return;
  gameshelfPinned.innerHTML = '';
  gameshelfPinned.hidden = true;
}

function renderGameshelf() {
  if (!gameshelfList) return;
  renderGameshelfPinned();
  const games = getGameshelfGames();
  gameshelfList.innerHTML = '';

  if (!games.length) {
    stopGameshelfAutoScroll();
    const emptyEl = document.createElement('div');
    emptyEl.className = 'gameshelf-empty';
    emptyEl.textContent = 'No saved games yet.';
    gameshelfList.appendChild(emptyEl);
    scheduleRecoverySync();
    return;
  }

  games.forEach((game, index) => {
    const slot = document.createElement('div');
    slot.className = 'gameshelf-slot';

    const button = document.createElement('button');
    const isActive = game.id === state.currentGameId;
    const isDirty = isActive && hasUnsavedChanges();
    const colors = isActive ? getCurrentGameColors() : getSavedGameColors(game, index);

    button.type = 'button';
    button.className = 'gameshelf-game' + (isDirty ? ' is-dirty' : '');
    button.dataset.gameId = game.id;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (isActive) button.setAttribute('aria-current', 'true');
    button.title = formatSavedGameLabel(game);
    applyGameshelfButtonColors(button, colors);
    button.innerHTML = `
      ${isActive ? buildNowPlayingBadgeMarkup() : ''}
      <span class="gameshelf-game-title">${escapeHtml(game.name || 'Untitled Game')}</span>
    `;
    button.addEventListener('click', () => {
      requestOpenSavedGame(game.id, button);
    });

    slot.appendChild(button);
    gameshelfList.appendChild(slot);
  });

  stopGameshelfAutoScroll(false);
  scheduleRecoverySync();
}

function getSavedGameUpdatedTime(game) {
  if (!game || !game.updatedAt) return 0;

  try {
    const when = new Date(game.updatedAt);
    return Number.isNaN(when.getTime()) ? 0 : when.getTime();
  } catch (error) {
    return 0;
  }
}

function getSavedGameCreatedTime(game) {
  if (!game || !game.createdAt) return getSavedGameUpdatedTime(game);

  try {
    const when = new Date(game.createdAt);
    return Number.isNaN(when.getTime()) ? getSavedGameUpdatedTime(game) : when.getTime();
  } catch (error) {
    return getSavedGameUpdatedTime(game);
  }
}

function compareSavedGamesAlphabetical(a, b) {
  return String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { sensitivity: 'base' });
}

function compareSavedGamesNewestFirst(a, b) {
  const timeDiff = getSavedGameCreatedTime(b) - getSavedGameCreatedTime(a);
  if (timeDiff !== 0) return timeDiff;
  return compareSavedGamesAlphabetical(a, b);
}

function getHeaderGameGroup(game) {
  if (normalizeErasedFlag(game && game.erased) === ERASED_GAME_VALUE) return 'ERASED';
  if (normalizeArchivedFlag(game && game.archived) === ARCHIVED_GAME_VALUE) return 'ARCHIVED';
  return 'LIVE';
}

function compareHeaderGames(a, b) {
  const groupOrder = {
    LIVE: 0,
    ARCHIVED: 1,
    ERASED: 2
  };
  const groupDiff = (groupOrder[getHeaderGameGroup(a)] ?? 99) - (groupOrder[getHeaderGameGroup(b)] ?? 99);
  if (groupDiff !== 0) return groupDiff;
  return compareSavedGamesAlphabetical(a, b);
}

function buildHeaderGameList(games = []) {
  const gameMap = new Map();

  games.forEach((rawGame, index) => {
    if (!rawGame) return;
    const normalizedGame = normalizeSavedGame(rawGame, index);
    const gameId = String(normalizedGame.id || '').trim();
    if (!gameId) return;
    gameMap.set(gameId, normalizedGame);
  });

  return [...gameMap.values()].sort(compareHeaderGames);
}

function getCurrentHeaderGameEntry() {
  if (!state.currentGameId) return null;
  const sourceGame = state.headerGames.find((game) => game && game.id === state.currentGameId)
    || state.store.games.find((game) => game && game.id === state.currentGameId)
    || { id: state.currentGameId };
  return normalizeSavedGame({
    ...sourceGame,
    id: state.currentGameId,
    name: hasGameNode() ? getDocName() : (sourceGame.name || 'Untitled Game'),
    updatedAt: state.doc && state.doc.updatedAt ? state.doc.updatedAt : (sourceGame.updatedAt || ''),
    nodes: Array.isArray(state.doc.nodes) && state.doc.nodes.length ? state.doc.nodes : sourceGame.nodes,
    links: Array.isArray(state.doc.links) && state.doc.links.length ? state.doc.links : sourceGame.links
  }, 0);
}

function getHeaderGames() {
  const games = [...(state.headerGames || []), ...(state.store.games || [])];
  const currentGame = getCurrentHeaderGameEntry();
  if (currentGame) games.push(currentGame);
  return buildHeaderGameList(games);
}

function renderGamePickerSelect() {
  if (!gamePickerSelect) return;

  const games = getHeaderGames();
  gamePickerSelect.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = HEADER_GAME_PLACEHOLDER_VALUE;
  placeholderOption.textContent = 'PICK A GAME';
  placeholderOption.disabled = true;
  gamePickerSelect.appendChild(placeholderOption);

  const newOption = document.createElement('option');
  newOption.value = HEADER_GAME_NEW_VALUE;
  newOption.textContent = 'NEW GAME';
  gamePickerSelect.appendChild(newOption);

  const groups = [
    { key: 'LIVE', label: 'LIVE', games: [] },
    { key: 'ARCHIVED', label: 'ARCHIVED', games: [] },
    { key: 'ERASED', label: 'ERASED', games: [] }
  ];
  const groupMap = new Map(groups.map((group) => [group.key, group]));

  games.forEach((game) => {
    const group = groupMap.get(getHeaderGameGroup(game));
    if (group) group.games.push(game);
  });

  groups.forEach((group) => {
    if (!group.games.length) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.games.forEach((game) => {
      const option = document.createElement('option');
      option.value = game.id;
      option.textContent = game.name || 'Untitled Game';
      option.disabled = group.key === 'ERASED';
      optgroup.appendChild(option);
    });
    gamePickerSelect.appendChild(optgroup);
  });

  const selectedValue = state.currentGameId && games.some((game) => game.id === state.currentGameId)
    ? state.currentGameId
    : HEADER_GAME_PLACEHOLDER_VALUE;
  gamePickerSelect.value = selectedValue;
  const selectedOption = gamePickerSelect.options[gamePickerSelect.selectedIndex];
  gamePickerSelect.title = selectedOption ? selectedOption.textContent : 'Games';
  updateActionUi();
}

function getSelectedGamePickerId() {
  if (!gamePickerSelect) return '';
  const selectedValue = String(gamePickerSelect.value || '').trim();
  if (!selectedValue || selectedValue === HEADER_GAME_PLACEHOLDER_VALUE || selectedValue === HEADER_GAME_NEW_VALUE) return '';
  return selectedValue;
}

function setHeaderGames(games = []) {
  state.headerGames = buildHeaderGameList(games);
  renderGamePickerSelect();
}

function upsertHeaderGame(game) {
  if (!game || !game.id) {
    renderGamePickerSelect();
    return;
  }
  state.headerGames = buildHeaderGameList([
    ...(state.headerGames || []).filter((entry) => entry && entry.id !== game.id),
    game
  ]);
  renderGamePickerSelect();
}

function removeHeaderGame(gameId) {
  const targetId = String(gameId || '').trim();
  if (!targetId) return;
  state.headerGames = buildHeaderGameList((state.headerGames || []).filter((entry) => entry && entry.id !== targetId));
  renderGamePickerSelect();
}

async function refreshHeaderGames() {
  const remoteStore = await loadHeaderGameStoreFromSupabase();
  const localStore = readLocalStoreSnapshot();
  const currentStore = buildStoreFromGames([...(state.headerGames || []), ...(state.store.games || [])]);
  const mergedGames = [
    ...(remoteStore && Array.isArray(remoteStore.games) ? remoteStore.games : []),
    ...(localStore && Array.isArray(localStore.games) ? localStore.games : []),
    ...(currentStore && Array.isArray(currentStore.games) ? currentStore.games : [])
  ];
  setHeaderGames(mergedGames);
}

function isSavedLegacyAnytimeNode(node) {
  return !!(node && node.anytime && String(node.anytimePairId || '').trim());
}

function isSavedConversationThreadNode(node) {
  return !!node
    && !isSavedLegacyAnytimeNode(node)
    && (node.type === 'stop' || node.type === 'bubble' || node.type === 'reply' || node.type === 'button');
}

function getWaypointGroupsFromSavedGame(game) {
  const sourceNodes = Array.isArray(game && game.nodes) ? game.nodes.filter(Boolean) : [];
  const threadNodes = getSortedConversationNodesFromList(
    sourceNodes.filter((node) => isSavedConversationThreadNode(node)),
    sourceNodes
  );
  const groups = [];
  let currentGroup = null;

  threadNodes.forEach((node) => {
    if (node.type === 'stop') {
      currentGroup = {
        stop: node,
        nodes: [node]
      };
      groups.push(currentGroup);
      return;
    }
    if (!currentGroup) return;
    currentGroup.nodes.push(node);
  });

  return groups.filter((group) => group && group.stop);
}

function extractWaypointLibraryEntriesFromGame(game) {
  if (!game || !Array.isArray(game.nodes) || !game.nodes.length) return [];
  const gameName = String(game.name || 'Untitled Game').trim() || 'Untitled Game';
  const sourceLinks = Array.isArray(game.links) ? game.links.filter(Boolean) : [];

  return getWaypointGroupsFromSavedGame(game).map((group) => {
    const nodeIds = new Set(group.nodes.map((node) => node.id));
    const internalLinks = sourceLinks.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to));
    const stopTitle = normalizeWaypointTitle(group.stop.title, TYPE_CONFIG.stop.title);
    return {
      id: String(game.id || '') + '::' + String(group.stop.id || ''),
      sourceGameId: String(game.id || ''),
      sourceGameName: gameName,
      waypointId: String(group.stop.id || ''),
      stopTitle,
      nodes: group.nodes.map((node) => cloneObj(node)),
      links: internalLinks.map((link) => cloneObj(link))
    };
  });
}

function mergeWaypointLibraryGames(gameLists = []) {
  const mergedById = new Map();

  gameLists.forEach((games) => {
    (Array.isArray(games) ? games : []).forEach((rawGame, index) => {
      if (!rawGame) return;
      const normalizedGame = normalizeSavedGame(rawGame, index);
      const gameId = String(normalizedGame.id || '').trim();
      if (!gameId) return;
      if (normalizeErasedFlag(normalizedGame.erased) === ERASED_GAME_VALUE) return;
      const existing = mergedById.get(gameId);
      const existingHasNodes = !!(existing && Array.isArray(existing.nodes) && existing.nodes.length);
      const nextHasNodes = Array.isArray(normalizedGame.nodes) && normalizedGame.nodes.length > 0;
      const shouldReplace = !existing
        || (nextHasNodes && !existingHasNodes)
        || (nextHasNodes === existingHasNodes && getSavedGameUpdatedTime(normalizedGame) >= getSavedGameUpdatedTime(existing));
      if (!shouldReplace) return;
      mergedById.set(gameId, normalizedGame);
    });
  });

  return [...mergedById.values()];
}

function compareWaypointLibraryEntries(a, b) {
  const titleDiff = String(a && a.stopTitle || '').localeCompare(String(b && b.stopTitle || ''), undefined, { sensitivity: 'base' });
  if (titleDiff !== 0) return titleDiff;
  const gameDiff = String(a && a.sourceGameName || '').localeCompare(String(b && b.sourceGameName || ''), undefined, { sensitivity: 'base' });
  if (gameDiff !== 0) return gameDiff;
  return String(a && a.id || '').localeCompare(String(b && b.id || ''), undefined, { sensitivity: 'base' });
}

function getWaypointLibraryEntry(entryId) {
  const targetId = String(entryId || '').trim();
  if (!targetId) return null;
  return (state.waypointLibraryEntries || []).find((entry) => entry && entry.id === targetId) || null;
}

function buildWaypointLibraryCardMarkup(entry) {
  return `
    <span class="waypoint-library-card">
      <span class="waypoint-library-game">${escapeHtml(entry && entry.sourceGameName || '')}</span>
      <span class="waypoint-library-name">${escapeHtml(entry && entry.stopTitle || TYPE_CONFIG.stop.title)}</span>
    </span>
  `;
}

function renderWaypointLibrary() {
  if (!waypointLibraryList || !waypointLibraryStatus) return;
  waypointLibraryList.innerHTML = '';
  const entries = Array.isArray(state.waypointLibraryEntries) ? state.waypointLibraryEntries : [];

  if (state.waypointLibraryLoading) {
    waypointLibraryStatus.hidden = false;
    waypointLibraryStatus.textContent = state.waypointLibraryStatusText || 'Loading saved waypoints...';
    return;
  }

  if (!entries.length) {
    waypointLibraryStatus.hidden = false;
    waypointLibraryStatus.textContent = state.waypointLibraryStatusText || 'No saved waypoints yet.';
    return;
  }

  waypointLibraryStatus.hidden = !String(state.waypointLibraryStatusText || '').trim();
  waypointLibraryStatus.textContent = state.waypointLibraryStatusText || '';

  entries.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'waypoint-library-btn';
    button.dataset.waypointLibraryId = entry.id;
    button.innerHTML = buildWaypointLibraryCardMarkup(entry);
    waypointLibraryList.appendChild(button);
  });
}

async function refreshWaypointLibrary(options = {}) {
  const refreshToken = state.waypointLibraryRefreshToken + 1;
  state.waypointLibraryRefreshToken = refreshToken;
  state.waypointLibraryLoading = true;
  state.waypointLibraryStatusText = options.message || 'Loading saved waypoints...';
  renderWaypointLibrary();

  const currentGame = getCurrentHeaderGameEntry();
  const localStore = readLocalStoreSnapshot();
  const remoteStore = options.skipRemote ? null : await loadStoreFromSupabase();
  if (refreshToken !== state.waypointLibraryRefreshToken) return;

  const mergedGames = mergeWaypointLibraryGames([
    remoteStore && Array.isArray(remoteStore.games) ? remoteStore.games : [],
    localStore && Array.isArray(localStore.games) ? localStore.games : [],
    state.store && Array.isArray(state.store.games) ? state.store.games : [],
    currentGame ? [currentGame] : []
  ]);

  state.waypointLibraryEntries = mergedGames
    .flatMap((game) => extractWaypointLibraryEntriesFromGame(game))
    .sort(compareWaypointLibraryEntries);
  state.waypointLibraryLoading = false;
  state.waypointLibraryStatusText = state.waypointLibraryEntries.length
    ? ''
    : 'No saved waypoints yet.';
  renderWaypointLibrary();
}

function getLinkPortLabel(link) {
  const fromPort = normalizeFromPort(getNode(link && link.from) || parseTypedNodeId(link && link.from)?.type, link && link.fromPort);
  if (fromPort.startsWith('branch-')) {
    return 'OUT ' + fromPort.replace('branch-', '');
  }
  return fromPort.replace('out-', '').toUpperCase();
}

function getLinkSelectionLabel(link) {
  if (!link) return 'Connection';
  return 'CONNECTION / ' + getLinkPortLabel(link);
}

function openSavedGame(gameId, options = {}) {
  const game = state.store.games.find((entry) => entry.id === gameId);
  if (!game) return;

  runWithoutRecoverySync(() => {
    setHeaderOnlyMode(false);
    state.currentGameId = game.id;
    state.doc = normalizeDoc(game);
    setCurrentGameColors(game);
    syncAllTagsFromStore();
    syncNextNodeNumbers();
    state.selectedLinkId = null;
    const gameNode = state.doc.nodes.find((entry) => entry && entry.type === 'game');
    state.selectedId = gameNode
      ? gameNode.id
      : (state.doc.nodes.length ? state.doc.nodes[0].id : null);

    try {
      localStorage.setItem(LOCAL_OPEN_GAME_KEY, game.id);
    } catch (error) {
    }
    if (options.updateUrl !== false) {
      clearEditorLaunchIntent();
    }

    rememberCleanSnapshot();
    upsertHeaderGame(game);
    renderGameshelf();
    renderAll();
  });
  if (options.preserveRecovery) {
    setSaveStatus(state.localOnlyChanges ? 'local' : 'saved', 'Viewing Saved Game');
  } else if (state.localOnlyChanges) {
    syncRecoveryDraftNow({ updateStatus: false });
    setSaveStatus('local', 'Local Changes Only');
  } else {
    clearRecoveryDraft();
    setSaveStatus('saved', 'Viewing Saved Game');
  }
  void refreshWaypointLibrary({ message: 'Loading saved waypoints...' });
}

async function openSavedGameById(gameId, options = {}) {
  const nextGameId = String(gameId || '').trim();
  if (!nextGameId || nextGameId === state.currentGameId) return false;

  const preserveRecovery = !!options.preserveRecovery;
  if (preserveRecovery) syncRecoveryDraftNow({ updateStatus: false });

  setSaveStatus('loading', 'Loading Game');

  let targetGame = state.store.games.find((game) => (
    game
    && game.id === nextGameId
    && Array.isArray(game.nodes)
    && game.nodes.length
  )) || null;

  if (!targetGame && hasSupabaseStore()) {
    targetGame = await loadGameFromSupabase(nextGameId);
  }

  if (!targetGame) {
    await refreshHeaderGames();
    setSaveStatus(state.currentGameId ? (state.localOnlyChanges ? 'local' : 'saved') : 'idle');
    return false;
  }

  state.store = buildStoreFromGames([targetGame]);
  openSavedGame(targetGame.id, { preserveRecovery, updateUrl: false });
  await refreshHeaderGames();
  return true;
}

function getRememberedOpenGameId() {
  try {
    return String(localStorage.getItem(LOCAL_OPEN_GAME_KEY) || '').trim();
  } catch (error) {
    return '';
  }
}

async function syncStoreToSupabase() {
  if (!hasSupabaseStore()) return null;

  const targetGame = state.store.games.find((game) => game && game.id === state.currentGameId) || state.store.games[0] || null;
  if (!targetGame) {
    return {
      serverSaved: false,
      localOnly: true,
      error: new Error('No game ready to save.')
    };
  }

  try {
    const payload = serializeGameRow(targetGame, 0);
    const response = await fetch(buildSupabaseUrl({
      on_conflict: 'id'
    }), {
      method: 'POST',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      }),
      body: JSON.stringify([payload])
    });

    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase save failed');
    }

    const rows = await response.json();
    const savedGame = normalizeGameRow(
      Array.isArray(rows) && rows.length ? rows[0] : payload,
      0
    );
    state.currentGameId = savedGame.id;
    setCurrentGameColors(savedGame);
    state.store = buildStoreFromGames([savedGame]);
    syncAllTagsFromStore();
    persistStoreLocally();
    return { serverSaved: true, localOnly: false, storageKind: SUPABASE_STORAGE_KIND, savedGame };
  } catch (error) {
    return { serverSaved: false, localOnly: true, error };
  }
}

function getEditorLaunchIntent() {
  try {
    const storedIntent = JSON.parse(sessionStorage.getItem(EDITOR_LAUNCH_INTENT_KEY) || 'null');
    if (storedIntent && typeof storedIntent === 'object') {
      sessionStorage.removeItem(EDITOR_LAUNCH_INTENT_KEY);
      const gameId = String(storedIntent.gameId || '').trim();
      const wantsNew = !!storedIntent.newGame;
      return {
        gameId,
        wantsNew,
        explicit: wantsNew || !!gameId
      };
    }
  } catch (error) {
  }

  try {
    const url = new URL(location.href);
    const gameId = String(url.searchParams.get('gameId') || url.searchParams.get('id') || '').trim();
    const newValue = String(url.searchParams.get('new') || '').trim().toLowerCase();
    const wantsNew = newValue === '1' || newValue === 'true' || newValue === 'yes';
    return {
      gameId,
      wantsNew,
      explicit: wantsNew || !!gameId
    };
  } catch (error) {
    return {
      gameId: '',
      wantsNew: false,
      explicit: false
    };
  }
}

function clearEditorLaunchIntent() {
  try {
    sessionStorage.removeItem(EDITOR_LAUNCH_INTENT_KEY);
  } catch (error) {
  }

  try {
    const url = new URL(location.href);
    url.searchParams.delete('new');
    url.searchParams.delete('gameId');
    url.searchParams.delete('id');
    const nextUrl = url.pathname + url.search + url.hash;
    history.replaceState(null, '', nextUrl);
  } catch (error) {
  }
}

function countGamesWithTag(tagLower) {
  const allDocs = [...(state.store.games || []), state.doc];
  return allDocs.filter((doc) => {
    const gameNode = doc && doc.nodes && doc.nodes.find((n) => n.type === 'game');
    return gameNode && Array.isArray(gameNode.tags) && gameNode.tags.some((t) => t.toLowerCase() === tagLower);
  }).length;
}

function renderTagPicker(node) {
  const existingWraps = [...nodeTagPicker.querySelectorAll('.tag-pill-wrap')];
  existingWraps.forEach((wrap) => wrap.remove());

  const isGameNode = !!node && node.type === 'game';
  const selectedLower = new Set(isGameNode ? (node.tags || []).map(t => t.toLowerCase()) : []);

  allTags.forEach((tag) => {
    const tagLower = tag.toLowerCase();
    const isProtectedTag = tagLower === FEATURED_TAG.toLowerCase();
    const wrap = document.createElement('span');
    wrap.className = 'tag-pill-wrap' + (isProtectedTag ? ' is-protected' : '');

    const count = countGamesWithTag(tagLower);
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tag-pill' + (selectedLower.has(tagLower) ? ' on' : '');
    pill.textContent = tag;
    pill.title = `Tag used in ${count} ${count === 1 ? 'game' : 'games'}`;
    pill.disabled = !isGameNode;
    pill.addEventListener('click', () => {
      if (!isGameNode) return;
      const nextLower = new Set((node.tags || []).map(t => t.toLowerCase()));
      if (nextLower.has(tagLower)) {
        node.tags = (node.tags || []).filter(t => t.toLowerCase() !== tagLower);
      } else {
        node.tags = [...(node.tags || []), tag];
      }
      renderTagPicker(node);
      scheduleRecoverySync();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'tag-delete-btn';
    delBtn.textContent = '�';
    delBtn.setAttribute('aria-label', 'Delete tag ' + tag);
    delBtn.disabled = !isGameNode || isProtectedTag;
    if (isProtectedTag) {
      delBtn.hidden = true;
    }
    delBtn.addEventListener('click', () => {
      if (!isGameNode) return;
      if (isProtectedTag) return;
      deleteTagGlobally(tag);
    });

    wrap.appendChild(pill);
    wrap.appendChild(delBtn);
    nodeTagPicker.insertBefore(wrap, nodeTagNewInput);
  });
}

function buildNodeBodyMarkup(node) {
  const secondaryText = THREAD_LAYOUT_ENABLED
    ? getPhoneSecondaryText(node)
    : (node.body || '');
  return secondaryText
    ? `<div class="node-body">${!THREAD_LAYOUT_ENABLED && isBubbleLikeType(node.type) ? renderMessageHtml(secondaryText) : escapeHtml(secondaryText)}</div>`
    : '';
}

function buildNodeTitleMarkup(node, displayTitle) {
  if (!isBubbleLikeType(node.type)) {
    return `<div class="node-title"${getGameTitleStyle(node, displayTitle)}>${escapeHtml(displayTitle)}</div>`;
  }
  if (node.type === 'reply' && node.acceptAny) {
    return `<div class="node-title"${getGameTitleStyle(node, displayTitle)}>${escapeHtml('ANY PLAYER MSG')}</div>`;
  }
  if (node.type === 'bubble' && node.kind === 'image') {
    const src = String(node.body || '').trim();
    const content = src
      ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">`
      : `<span class="node-image-placeholder">No image</span>`;
    return `<div class="node-title">${content}</div>`;
  }
  if (node.type === 'bubble' && node.kind === 'video') {
    const embed = getVideoEmbedSrc(node.body);
    const content = embed
      ? (embed.type === 'iframe'
        ? `<iframe src="${escapeHtml(embed.src)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`
        : `<video src="${escapeHtml(embed.src)}" preload="metadata" muted playsinline></video>`)
      : `<span class="node-image-placeholder">No video</span>`;
    return `<div class="node-title">${content}</div>`;
  }
  return `<div class="node-title"${getGameTitleStyle(node, displayTitle)}>${renderMessageHtml(node.body, '')}</div>`;
}

function buildNodeBubbleMarkup(node) {
  if (!TYPE_CONFIG[node.type]) return '';
  if (node.type === 'button') return '';
  const side = getPhoneBubbleSide(node);
  const tailClass = side === 'left'
    ? 'node-bubble-tail--left'
    : side === 'right'
      ? 'node-bubble-tail--right'
      : 'node-bubble-tail--none';
  return `
    <div class="node-bubble" aria-hidden="true">
      <div class="node-bubble-shape"></div>
      <div class="node-bubble-tail ${tailClass}"></div>
    </div>
  `;
}

function buildRotateHandleMarkup(node) {
  return '';
}

function buildInPortMarkup(node) {
  if (!node || node.type === 'game' || isAnytimeReplyNode(node)) return '';
  return `
    <button class="node-port node-port--in" data-port="in-left" type="button" tabindex="-1" aria-hidden="true"></button>
  `;
}

function buildOutPortsMarkup(node) {
  const ports = getNodeOutPorts(node);
  return ports.map((port) => {
    const sideClass = port === 'out-bottom' ? 'node-port--out-bottom' : 'node-port--out-right';
    return `<button class="node-port ${sideClass}" data-port="${escapeHtml(port)}" type="button" tabindex="-1" aria-label="Connect from ${escapeHtml(getNodeAccessibleLabel(node))}"></button>`;
  }).join('');
}

function getGameTitleStyle(node, titleOverride = null) {
  if (!node) return '';
  if (THREAD_LAYOUT_ENABLED && isBubbleLikeType(node.type)) return '';

  const normalizedTitle = String(titleOverride != null ? titleOverride : node.title || '').trim().replace(/\s+/g, ' ');
  const words = normalizedTitle ? normalizedTitle.split(' ') : [];
  const longestWordLength = words.reduce((max, word) => Math.max(max, word.length), 0);
  const length = normalizedTitle.length;

  let fontSize = 0.92;
  if (length > 16) fontSize = 0.84;
  if (length > 24) fontSize = 0.76;
  if (length > 34) fontSize = 0.68;
  if (length > 46) fontSize = 0.6;

  if (longestWordLength > 12) fontSize = Math.min(fontSize, 0.74);
  if (longestWordLength > 16) fontSize = Math.min(fontSize, 0.64);

  const lineHeight = fontSize <= 0.64 ? 1.05 : 1.12;
  return ` style="font-size:${fontSize}rem;line-height:${lineHeight};"`;
}

function buildNodeMarkup(node) {
  const config = TYPE_CONFIG[node.type];
  const displayTitle = getNodeDisplayTitle(node);
  const kicker = getNodeKicker(node);
  const bodyMarkup = buildNodeBodyMarkup(node);
  const headerMarkup = `
    <div class="node-header">
      ${buildNodeTitleMarkup(node, displayTitle)}
    </div>
  `;
  const metaMarkup = isPhoneTextOnlyAnytimeReplyNode(node)
    ? ''
    : `
      <div class="node-meta">
        <div class="node-kicker">${escapeHtml(kicker)}</div>
      </div>
    `;
  const codeMarkup = '';
  const inPortMarkup = buildInPortMarkup(node);
  const chromeMarkup = `
    <div class="node-rotator">
      ${buildRotateHandleMarkup(node)}
      ${inPortMarkup}
      ${buildNodeBubbleMarkup(node)}
      ${buildOutPortsMarkup(node)}
    </div>
  `;
  return `
    ${metaMarkup}
    <div class="node-card">
      ${chromeMarkup}
      <div class="node-content">
        ${headerMarkup}
        ${bodyMarkup}
        ${codeMarkup}
      </div>
    </div>
  `;
}

function getStencilPreviewNode(type) {
  const baseNode = {
    id: 'stencil-' + type,
    type,
    x: 0,
    y: 0,
    width: TYPE_CONFIG[type]?.width || 0,
    height: TYPE_CONFIG[type]?.height || 0,
    title: type === 'stop' ? 'Waypoint' : '',
    tagline: '',
    startingLocation: '',
    howToPlay: '',
    guideName: '',
    guideBio: '',
    guideImageUrl: '',
    price: '',
    builderNotes: '',
    tags: [],
    body: '',
    varName: '',
    acceptAny: false,
    anytime: false,
    anytimePairId: '',
    rotation: 0
  };

  if (type === 'bubble') {
    baseNode.body = 'Guide message';
  } else if (type === 'reply') {
    baseNode.body = 'Player reply';
  } else if (type === 'button') {
    baseNode.title = 'BUY GAME TO CONTINUE';
  }

  if (type === 'stop' || type === 'bubble' || type === 'reply' || type === 'button') {
    const size = getPhoneBubbleSize(
      baseNode,
      (type === 'stop' || type === 'button') ? TYPE_CONFIG[type].width : PHONE_BUBBLE_MAX_WIDTH
    );
    baseNode.width = size.width;
    baseNode.height = size.height;
  }

  return baseNode;
}

function buildStencilPreviewMarkup(type) {
  const node = getStencilPreviewNode(type);
  const shortcut = STENCIL_SHORTCUTS[type] || '';
  return `
    <span class="stencil-node-preview stencil-node-preview--${escapeHtml(type)}" style="--stencil-preview-width:${Math.round(node.width)}px; --stencil-preview-height:${Math.round(node.height)}px;">
      <span class="stencil-node-shell node-shell node--${escapeHtml(type)}">
        ${buildNodeMarkup(node)}
      </span>
    </span>
    <span class="stencil-shortcut">${escapeHtml(shortcut)}</span>
  `;
}

function renderStencilPreviews() {
  if (!stencilBar) return;
  stencilBar.querySelectorAll('[data-stencil]').forEach((button) => {
    const type = String(button.dataset.stencil || '').trim();
    if (!type || !TYPE_CONFIG[type]) return;
    button.innerHTML = buildStencilPreviewMarkup(type);
  });
}

function positionNodeElement(node, el) {
  el.style.transform = 'translate(' + node.x + 'px,' + node.y + 'px)';
  el.style.width = node.width + 'px';
  el.style.height = node.height + 'px';
  el.style.setProperty('--node-rotation', getNodeRotation(node) + 'deg');
}

function positionGhost(ghostEl, clientX, clientY) {
  ghostEl.style.transform = 'translate(' + (clientX + 16) + 'px,' + (clientY + 16) + 'px)';
}

function applyZoom() {
  const base = getPhoneBaseSize();
  const metrics = state.layoutMetrics || {
    phoneWidth: PHONE_DEVICE_WIDTH,
    phoneHeight: PHONE_MIN_DEVICE_HEIGHT,
    phoneX: PHONE_DEVICE_X,
    phoneY: PHONE_DEVICE_Y,
    stencilTrayTop: PHONE_DEVICE_Y + PHONE_MIN_DEVICE_HEIGHT + PHONE_STENCIL_TRAY_GAP
  };
  phoneStage.style.width = Math.round(base.width) + 'px';
  phoneStage.style.height = Math.round(base.height) + 'px';
  phoneStage.style.removeProperty('zoom');
  phone.style.width = Math.round(metrics.phoneWidth) + 'px';
  phone.style.height = Math.round(metrics.phoneHeight) + 'px';
  phone.style.left = Math.round(metrics.phoneX) + 'px';
  phone.style.top = Math.round(metrics.phoneY) + 'px';
  const phoneCenterX = Math.round(metrics.phoneX + (metrics.phoneWidth / 2));
  if (stencilBar) {
    stencilBar.style.top = Math.round(metrics.stencilTrayTop) + 'px';
    stencilBar.style.left = phoneCenterX + 'px';
  }
  if (outsideAnytimeLabel) outsideAnytimeLabel.style.left = phoneCenterX + 'px';
}

function phonePointFromClient(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const scroll = usesSingleSheetScroll() ? { left: 0, top: 0 } : getViewportScrollPosition();
  return {
    inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    x: clientX - rect.left + scroll.left,
    y: clientY - rect.top + scroll.top
  };
}

function createPreviewPath(sourceNode, endX, endY, targetNode = null) {
  if (!sourceNode) return '';
  if (targetNode) {
    const route = getLinkRoute({
      from: sourceNode.id,
      to: targetNode.id,
      fromPort: getAutoLinkPort(sourceNode) || 'out-right'
    });
    if (route) return route.path;
  }

  const start = getOutPortPoint(sourceNode);
  const sourceCorridors = getNodeLinkCorridors(sourceNode);
  const previewLaneX = Math.max(sourceCorridors ? sourceCorridors.right : start.x, start.x);
  return buildRoundedPath([
    { x: start.x, y: start.y },
    { x: previewLaneX, y: start.y },
    { x: previewLaneX, y: endY },
    { x: endX, y: endY }
  ]);
}

function getOutPortPoint(node, fromPort = 'out-right') {
  const normalizedPort = normalizeFromPort(node, fromPort);
  if (normalizedPort === 'out-bottom') {
    return {
      x: node.x + node.width / 2,
      y: node.y + node.height + NODE_PORT_OFFSET
    };
  }
  return {
    x: node.x + node.width + NODE_PORT_OFFSET,
    y: node.y + node.height / 2
  };
}

function getInPortPoint(node) {
  return {
    x: node.x - NODE_PORT_OFFSET,
    y: node.y + node.height / 2
  };
}

function getLinkPoints(from, to, fromPort = 'out-right') {
  const start = getOutPortPoint(from, fromPort);
  const end = getInPortPoint(to);
  return {
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y
  };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const minA = Math.min(aStart, aEnd);
  const maxA = Math.max(aStart, aEnd);
  const minB = Math.min(bStart, bEnd);
  const maxB = Math.max(bStart, bEnd);
  return maxA >= minB && maxB >= minA;
}

function getLinkObstacle(node) {
  return {
    left: node.x - LINK_NODE_CLEARANCE,
    right: node.x + node.width + LINK_NODE_CLEARANCE,
    top: node.y - LINK_NODE_CLEARANCE,
    bottom: node.y + node.height + LINK_NODE_CLEARANCE
  };
}

function getNodeLinkCorridors(node) {
  const cell = getNodeGridCell(node);
  if (!node || !cell) return null;

  const major = getMajorGridSize();
  const stageSize = getPhoneStageSize();
  const phoneWidth = stageSize.width;
  const phoneHeight = stageSize.height;
  const obstacle = getLinkObstacle(node);

  return {
    left: clamp(Math.min((cell.col * major) + LINK_LANE_OFFSET, obstacle.left), LINK_LANE_OFFSET, phoneWidth - LINK_LANE_OFFSET),
    right: clamp(Math.max(((cell.col + 1) * major) - LINK_LANE_OFFSET, obstacle.right), LINK_LANE_OFFSET, phoneWidth - LINK_LANE_OFFSET),
    top: clamp(Math.min((cell.row * major) + LINK_LANE_OFFSET, obstacle.top), LINK_LANE_OFFSET, phoneHeight - LINK_LANE_OFFSET),
    bottom: clamp(Math.max(((cell.row + 1) * major) - LINK_LANE_OFFSET, obstacle.bottom), LINK_LANE_OFFSET, phoneHeight - LINK_LANE_OFFSET)
  };
}

function getSortedLaneYCandidates(fromNode, toNode, startY, endY) {
  const phoneHeight = getPhoneStageSize().height;
  const major = getMajorGridSize();
  const rows = getPlacementGridRows();
  const candidates = new Map();

  function addCandidate(value, priority) {
    const clampedValue = clamp(Math.round(value * 1000) / 1000, LINK_LANE_OFFSET, phoneHeight - LINK_LANE_OFFSET);
    const key = clampedValue.toFixed(3);
    const current = candidates.get(key);
    if (!current || priority < current.priority) {
      candidates.set(key, { value: clampedValue, priority });
    }
  }

  for (let row = 0; row < rows; row += 1) {
    addCandidate((row * major) + LINK_LANE_OFFSET, 0);
    addCandidate(((row + 1) * major) - LINK_LANE_OFFSET, 0);
  }

  const fromCorridors = getNodeLinkCorridors(fromNode);
  const toCorridors = getNodeLinkCorridors(toNode);
  [fromCorridors, toCorridors].forEach((corridors) => {
    if (!corridors) return;
    addCandidate(corridors.top, 0);
    addCandidate(corridors.bottom, 0);
  });

  state.doc.nodes.forEach((node) => {
    if (!node || node.id === fromNode.id || node.id === toNode.id) return;
    const corridors = getNodeLinkCorridors(node);
    if (!corridors) return;
    addCandidate(corridors.top, 1);
    addCandidate(corridors.bottom, 1);
  });

  return [...candidates.values()]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const scoreA = Math.abs(a.value - startY) + Math.abs(a.value - endY);
      const scoreB = Math.abs(b.value - startY) + Math.abs(b.value - endY);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.value - b.value;
    })
    .map((entry) => entry.value);
}

function isSegmentClear(ax, ay, bx, by, ignoreNodeIds = []) {
  const ignored = new Set(ignoreNodeIds.filter(Boolean));
  return !state.doc.nodes.some((node) => {
    if (!node || ignored.has(node.id)) return false;
    const rect = getLinkObstacle(node);
    if (Math.abs(ax - bx) < 0.001) {
      return ax >= rect.left && ax <= rect.right && rangesOverlap(ay, by, rect.top, rect.bottom);
    }
    if (Math.abs(ay - by) < 0.001) {
      return ay >= rect.top && ay <= rect.bottom && rangesOverlap(ax, bx, rect.left, rect.right);
    }
    return false;
  });
}

function dedupeRoutePoints(points) {
  const cleaned = [];
  points.forEach((point) => {
    if (!point) return;
    const last = cleaned[cleaned.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.001 && Math.abs(last.y - point.y) < 0.001) return;
    cleaned.push({ x: point.x, y: point.y });
  });
  return cleaned;
}

function removeCollinearRoutePoints(points) {
  if (points.length <= 2) return points;
  const cleaned = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = cleaned[cleaned.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const sameX = Math.abs(prev.x - current.x) < 0.001 && Math.abs(current.x - next.x) < 0.001;
    const sameY = Math.abs(prev.y - current.y) < 0.001 && Math.abs(current.y - next.y) < 0.001;
    if (sameX || sameY) continue;
    cleaned.push(current);
  }
  cleaned.push(points[points.length - 1]);
  return cleaned;
}

function buildRoundedPath(points, radius = LINK_CORNER_RADIUS) {
  const routePoints = removeCollinearRoutePoints(dedupeRoutePoints(points));
  if (!routePoints.length) return '';
  if (routePoints.length === 1) return 'M ' + routePoints[0].x + ' ' + routePoints[0].y;

  let d = 'M ' + routePoints[0].x + ' ' + routePoints[0].y;
  for (let index = 1; index < routePoints.length; index += 1) {
    const current = routePoints[index];
    if (index === routePoints.length - 1) {
      d += ' L ' + current.x + ' ' + current.y;
      continue;
    }

    const prev = routePoints[index - 1];
    const next = routePoints[index + 1];
    const inDx = current.x - prev.x;
    const inDy = current.y - prev.y;
    const outDx = next.x - current.x;
    const outDy = next.y - current.y;
    const inLength = Math.hypot(inDx, inDy);
    const outLength = Math.hypot(outDx, outDy);
    const cornerRadius = Math.min(radius, inLength / 2, outLength / 2);

    if (!cornerRadius || (!inDx && !inDy) || (!outDx && !outDy)) {
      d += ' L ' + current.x + ' ' + current.y;
      continue;
    }

    const cornerStart = {
      x: current.x - Math.sign(inDx) * cornerRadius,
      y: current.y - Math.sign(inDy) * cornerRadius
    };
    const cornerEnd = {
      x: current.x + Math.sign(outDx) * cornerRadius,
      y: current.y + Math.sign(outDy) * cornerRadius
    };

    d += ' L ' + cornerStart.x + ' ' + cornerStart.y;
    d += ' Q ' + current.x + ' ' + current.y + ' ' + cornerEnd.x + ' ' + cornerEnd.y;
  }
  return d;
}

function getLinkRoute(link) {
  const from = getNode(link.from);
  const to = getNode(link.to);
  if (!from || !to) return null;

    const points = getLinkPoints(from, to, link.fromPort || 'out-right');
  const fromCorridors = getNodeLinkCorridors(from);
  const toCorridors = getNodeLinkCorridors(to);
  if (!fromCorridors || !toCorridors) return null;

  const startLaneX = Math.max(fromCorridors.right, points.startX);
  const endLaneX = Math.min(toCorridors.left, points.endX);
  const ignoreNodeIds = [from.id, to.id];

  const candidateYs = getSortedLaneYCandidates(from, to, points.startY, points.endY);
  let laneY = candidateYs.find((candidateY) =>
    isSegmentClear(points.startX, points.startY, startLaneX, points.startY, ignoreNodeIds)
    && isSegmentClear(startLaneX, points.startY, startLaneX, candidateY, ignoreNodeIds)
    && isSegmentClear(startLaneX, candidateY, endLaneX, candidateY, ignoreNodeIds)
    && isSegmentClear(endLaneX, candidateY, endLaneX, points.endY, ignoreNodeIds)
    && isSegmentClear(endLaneX, points.endY, points.endX, points.endY, ignoreNodeIds)
  );

  if (laneY == null) laneY = candidateYs[0] ?? clamp((points.startY + points.endY) / 2, LINK_LANE_OFFSET, getPhoneStageSize().height - LINK_LANE_OFFSET);

  const routePoints = [
    { x: points.startX, y: points.startY },
    { x: startLaneX, y: points.startY },
    { x: startLaneX, y: laneY },
    { x: endLaneX, y: laneY },
    { x: endLaneX, y: points.endY },
    { x: points.endX, y: points.endY }
  ];

  return {
    points: removeCollinearRoutePoints(dedupeRoutePoints(routePoints)),
    path: buildRoundedPath(routePoints)
  };
}

function getDistanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

  const t = clamp((((px - ax) * dx) + ((py - ay) * dy)) / lengthSq, 0, 1);
  const closestX = ax + (dx * t);
  const closestY = ay + (dy * t);
  return Math.hypot(px - closestX, py - closestY);
}

function findNearestLinkIdAtPoint(x, y, maxDistance = LINK_INTERACTION_RADIUS) {
  let nearestLinkId = null;
  let nearestDistance = maxDistance;

  state.doc.links.forEach((link) => {
    const route = getLinkRoute(link);
    if (!route || !Array.isArray(route.points) || route.points.length < 2) return;

    for (let index = 1; index < route.points.length; index += 1) {
      const previous = route.points[index - 1];
      const current = route.points[index];
      const distance = getDistanceToSegment(x, y, previous.x, previous.y, current.x, current.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLinkId = link.id;
      }
    }
  });

  return nearestLinkId;
}

function selectLinkAndRefresh(linkId) {
  if (!linkId) return;
  selectLink(linkId);
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
}

function drawLinks() {
  linkLayer.innerHTML = '';
  const stageSize = getPhoneStageSize();
  linkLayer.setAttribute('viewBox', '0 0 ' + stageSize.width + ' ' + stageSize.height);
}

function renderSelectionStates() {
  nodeEls.forEach((el, id) => {
    const node = getNode(id);
    const sourceNode = state.connectDrag ? getNode(state.connectDrag.fromId) : null;
    const isValidConnectTarget =
      Boolean(state.connectDrag)
      && state.hoverTargetId === id
      && canNodeConnectTo(sourceNode, node);
    const isDockTarget =
      Boolean(state.dragNode)
      && state.dockTargetId === id;
    el.classList.toggle('selected', id === state.selectedId);
    el.classList.toggle('connect-target', isValidConnectTarget || isDockTarget);
  });
  syncPhoneStartButton();
}

function bringNodeToFront(nodeId) {
  const index = state.doc.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return;
  const node = state.doc.nodes.splice(index, 1)[0];
  state.doc.nodes.push(node);
}

function finishInlineNodeTitleEdit(nodeId, nextValue, commit) {
  const node = getNode(nodeId);
  if (commit && node && usesNodeTitle(node.type)) {
    node.title = node.type === 'stop'
      ? normalizeWaypointTitle(nextValue, TYPE_CONFIG[node.type].title)
      : (String(nextValue || '').trim() || TYPE_CONFIG[node.type].title);
  }
  renderAll();
}

function startInlineNodeTitleEdit(nodeId) {
  const node = getNode(nodeId);
  const el = nodeEls.get(nodeId);
  if (!node || !usesNodeTitle(node.type) || !el) return;
  if (el.querySelector('.node-title-input')) return;

  const titleEl = el.querySelector('.node-title');
  const titleWrap = titleEl ? titleEl.parentElement : null;
  if (!titleEl || !titleWrap) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'node-title-input';
  input.setAttribute('aria-label', TYPE_CONFIG[node.type].kicker + ' name');
  input.value = node.type === 'stop'
    ? normalizeWaypointTitle(node.title, TYPE_CONFIG[node.type].title)
    : String(node.title || TYPE_CONFIG[node.type].title);
  if (node.type === 'stop') input.style.textTransform = 'uppercase';

  titleEl.hidden = true;
  titleWrap.appendChild(input);

  const syncInspectorTitle = () => {
    if (state.selectedId !== nodeId) return;
    if (node.type === 'game') nodeTitleInput.value = input.value;
    if (node.type === 'stop') {
      input.value = normalizeWaypointTitle(input.value, TYPE_CONFIG.stop.title);
      stopNameInput.value = input.value;
    }
  };

  const stopEvent = (event) => {
    event.stopPropagation();
  };

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    finishInlineNodeTitleEdit(nodeId, input.value, commit);
  };

  input.addEventListener('pointerdown', stopEvent);
  input.addEventListener('click', stopEvent);
  input.addEventListener('dblclick', stopEvent);
  input.addEventListener('input', syncInspectorTitle);
  input.addEventListener('keydown', (event) => {
    stopEvent(event);
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));

  selectNode(nodeId);
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
  syncInspectorTitle();

  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function attachNodeEvents(el, node) {
  let tripleClickCount = 0;
  let tripleClickTimer = null;

  el.addEventListener('click', (event) => {
    if (event.target.closest('.node-port')) return;
    if (!THREAD_LAYOUT_ENABLED && node.type === 'bubble') {
      tripleClickCount++;
      clearTimeout(tripleClickTimer);
      tripleClickTimer = setTimeout(() => { tripleClickCount = 0; }, 400);
      if (tripleClickCount >= 3) {
        tripleClickCount = 0;
        clearTimeout(tripleClickTimer);
        event.preventDefault();
        event.stopPropagation();
        closeNodeContextMenu();
        selectNode(node.id);
        renderSelectionStates();
        node.rotation = (getNodeRotation(node) + 90) % 360;
        positionNodeElement(node, el);
        drawLinks();
        updateSelectionUi();
        return;
      }
    }
    const wasSelected = state.selectedId === node.id;
    const editableTitleClicked = node.type === 'game' && !!event.target.closest('.node-title');
    closeNodeContextMenu();
    selectNode(node.id);
    renderSelectionStates();
    drawLinks();
    updateSelectionUi();
    if (editableTitleClicked && wasSelected) {
      startInlineNodeTitleEdit(node.id);
    }
  });

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.node-port')) return;
    const editableTitleClicked = node.type === 'game' && !!event.target.closest('.node-title');
    closeNodeContextMenu();
    if (node.type === 'game' || editableTitleClicked) {
      event.preventDefault();
      selectNode(node.id);
      renderSelectionStates();
      drawLinks();
      updateSelectionUi();
      return;
    }
    event.preventDefault();
    selectNode(node.id);
    renderSelectionStates();
    drawLinks();
    updateSelectionUi();
    if (THREAD_LAYOUT_ENABLED) {
      if (!canReorderPhoneThreadNode(node)) return;
      const point = phonePointFromClient(event.clientX, event.clientY);
      state.dropSlot = null;
      hideBubbleDropLine();
      state.dragNode = {
        id: node.id,
        offsetX: point.x - node.x,
        offsetY: point.y - node.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        reorderOnly: true,
        originX: node.x,
        originY: node.y
      };

      const currentEl = nodeEls.get(node.id);
      if (currentEl) {
        currentEl.classList.add('dragging');
        currentEl.setPointerCapture(event.pointerId);
      }
      return;
    }

    const point = phonePointFromClient(event.clientX, event.clientY);
    const anytimePairNodes = isAnytimeNode(node) ? getAnytimePairNodes(getAnytimePairId(node)) : [];
    state.dragNode = {
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      detachedIncoming: false,
      dockCandidate: null,
      subtreeIds: [...getAttachedSubtreeIds(node.id)],
      anytimePairNodeIds: anytimePairNodes.map((candidate) => candidate.id)
    };

    const currentEl = nodeEls.get(node.id);
    if (currentEl) {
      currentEl.classList.add('dragging');
      currentEl.setPointerCapture(event.pointerId);
    }
  });

  if (node.type === 'game' || node.type === 'stop') {
    el.addEventListener('dblclick', (event) => {
      if (event.target.closest('.node-port')) return;
      event.preventDefault();
      event.stopPropagation();
      closeNodeContextMenu();
      selectNode(node.id);
      startInlineNodeTitleEdit(node.id);
    });
  }

  el.querySelectorAll('.node-port[data-port^="out-"]').forEach((outPort) => {
    outPort.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const fromPort = outPort.dataset.port || 'out-right';
      const start = getOutPortPoint(node, fromPort);
      selectNode(node.id);
      state.connectDrag = {
        fromId: node.id,
        fromPort,
        x: start.x,
        y: start.y
      };
      drawLinks();
      updateSelectionUi();
    });
  });

  el.querySelectorAll('.node-port--in').forEach((inPort) => {
    inPort.addEventListener('pointerdown', (event) => {
      if (state.connectDrag) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });

  el.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.node-port')) return;
    if (node.type === 'game') {
      event.preventDefault();
      event.stopPropagation();
      closeNodeContextMenu();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectNode(node.id);
    renderSelectionStates();
    drawLinks();
    updateSelectionUi();
    openNodeContextMenu(node.id, event.clientX, event.clientY);
  });
}

function renderNode(node) {
  const el = document.createElement('div');
  el.className = 'node-shell node--' + node.type + (node.kind ? ' node-kind--' + node.kind : '') + (isInlineAnytimeWaypointNode(node) ? ' is-anytime-waypoint' : '');
  el.dataset.id = node.id;
  el.innerHTML = buildNodeMarkup(node);
  positionNodeElement(node, el);
  attachNodeEvents(el, node);
  nodeLayer.appendChild(el);
  nodeEls.set(node.id, el);

  // For video bubbles: grow the phone once dimensions are known
  if (node.type === 'bubble' && node.kind === 'video') {
    const reflow = () => {
      if (nodeEls.get(node.id) !== el) return;
      const card = el.querySelector('.node-card');
      const content = el.querySelector('.node-content');
      if (!card || !content) return;
      const prevShell = el.style.height;
      const prevCard = card.style.height;
      const prevContent = content.style.height;
      el.style.height = 'auto';
      card.style.height = 'auto';
      content.style.height = 'auto';
      const h = Math.max(38, Math.ceil(card.getBoundingClientRect().height));
      el.style.height = prevShell;
      card.style.height = prevCard;
      content.style.height = prevContent;
      if (Math.abs(h - node.height) > 2 || node._naturalImageWidth) {
        node.height = h;
        applyPhoneThreadLayout();
        nodeEls.forEach((nodeEl, nodeId) => {
          const n = state.doc.nodes.find((x) => x && x.id === nodeId);
          if (n) positionNodeElement(n, nodeEl);
        });
        updatePhoneChrome();
        applyZoom();
      }
    };
    const iframe = el.querySelector('.node-title iframe');
    if (iframe) {
      // iframe: 16:9 aspect ratio � reflow once it's in the DOM
      node._naturalImageWidth = node.width - 12;
      requestAnimationFrame(reflow);
    } else {
      const vid = el.querySelector('.node-title video');
      if (vid && vid.readyState < 1) {
        vid.addEventListener('loadedmetadata', () => {
          node._naturalImageWidth = vid.videoWidth;
          node._naturalImageHeight = vid.videoHeight;
          reflow();
        }, { once: true });
      }
    }
  }

  // For image bubbles: grow the phone once the image actually loads
  if (node.type === 'bubble' && node.kind === 'image') {
    const img = el.querySelector('.node-title img');
    if (img && !img.complete) {
      img.addEventListener('load', () => {
        if (nodeEls.get(node.id) !== el) return; // element was replaced by a later renderAll
        const card = el.querySelector('.node-card');
        const content = el.querySelector('.node-content');
        if (!card || !content) return;
        // Store natural image dimensions so getPhoneBubbleSize can compute the right bubble width
        node._naturalImageWidth = img.naturalWidth;
        node._naturalImageHeight = img.naturalHeight;
        // Mirror syncRenderedMessageNodeHeights measurement exactly
        const prevShell = el.style.height;
        const prevCard = card.style.height;
        const prevContent = content.style.height;
        el.style.height = 'auto';
        card.style.height = 'auto';
        content.style.height = 'auto';
        const h = Math.max(38, Math.ceil(card.getBoundingClientRect().height));
        el.style.height = prevShell;
        card.style.height = prevCard;
        content.style.height = prevContent;
        if (Math.abs(h - node.height) > 2 || node._naturalImageWidth) {
          node.height = h;
          applyPhoneThreadLayout();
          nodeEls.forEach((nodeEl, nodeId) => {
            const n = state.doc.nodes.find((x) => x && x.id === nodeId);
            if (n) positionNodeElement(n, nodeEl);
          });
          updatePhoneChrome();
          applyZoom();
        }
      }, { once: true });
    }
  }
}

function syncRenderedMessageNodeHeights() {
  if (!THREAD_LAYOUT_ENABLED) return false;
  let changed = false;

  state.doc.nodes.forEach((node) => {
    if (!node || (node.type !== 'bubble' && node.type !== 'reply')) return;
    const el = nodeEls.get(node.id);
    if (!el) return;
    const card = el.querySelector('.node-card');
    const content = el.querySelector('.node-content');
    if (!card || !content) return;

    // Skip media bubbles whose content hasn't loaded yet � the load handler will re-layout
    if (node.type === 'bubble' && node.kind === 'image') {
      const img = el.querySelector('.node-title img');
      if (img && !img.complete) return;
    }
    if (node.type === 'bubble' && node.kind === 'video') {
      const iframe = el.querySelector('.node-title iframe');
      if (iframe) return; // iframe uses requestAnimationFrame reflow
      const vid = el.querySelector('.node-title video');
      if (vid && vid.readyState < 1) return;
    }

    const previousShellHeight = el.style.height;
    const previousCardHeight = card.style.height;
    const previousContentHeight = content.style.height;

    el.style.height = 'auto';
    card.style.height = 'auto';
    content.style.height = 'auto';

    const measuredHeight = Math.max(38, Math.ceil(card.getBoundingClientRect().height));

    el.style.height = previousShellHeight;
    card.style.height = previousCardHeight;
    content.style.height = previousContentHeight;

    if (Math.abs(measuredHeight - node.height) > 2) {
      node.height = measuredHeight;
      changed = true;
    }
  });

  return changed;
}

let isSyncingRenderedMessageHeights = false;

function renderAll() {
  applyPhoneThreadLayout();
  updatePhoneChrome();
  applyZoom();
  renderGameshelf();
  if (!state.dragNode || !state.dragNode.reorderOnly) {
    state.dropSlot = null;
    hideBubbleDropLine();
  }
  nodeLayer.innerHTML = '';
  nodeEls.clear();
  if (phoneStage) phoneStage.classList.toggle('is-home', !hasGameNode());
  if (viewport) viewport.classList.toggle('is-home', !hasGameNode());

  if (!hasGameNode()) {
    const hint = document.createElement('div');
    hint.className = 'phone-empty-hint';
    hint.innerHTML = 'Click Games to choose a game.';
    nodeLayer.appendChild(hint);
  }

  state.doc.nodes
    .filter((node) => !(THREAD_LAYOUT_ENABLED && node.type === 'game'))
    .forEach(renderNode);
  if (!isSyncingRenderedMessageHeights && syncRenderedMessageNodeHeights()) {
    isSyncingRenderedMessageHeights = true;
    renderAll();
    isSyncingRenderedMessageHeights = false;
    return;
  }
  updateStencilAvailability();
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
}

function updateStencilAvailability() {
  const gameTaken = hasGameNode();
  stencilBar.querySelectorAll('[data-stencil]').forEach((button) => {
    const isGameStencil = button.dataset.stencil === 'game';
    const disabled = !gameTaken || (isGameStencil && gameTaken);
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.title = '';
  });
  if (addPanel) {
    addPanel.querySelectorAll('[data-add-stencil]').forEach((button) => {
      const disabled = !gameTaken;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
  }
}

function syncDetailsSectionVisibility() {
  if (!inspectorContent) return;
  inspectorContent.querySelectorAll('.details-section').forEach((section) => {
    const hasVisibleField = Array.from(section.querySelectorAll('.field, .mini-note'))
      .some((element) => !element.hidden);
    section.hidden = !hasVisibleField;
  });
}

function updateObjectInspectorUi(node, link, copyText) {
  const hasObjectSelection = !!link || !!(node && node.type !== 'game');
  if (objectDetailsCard) objectDetailsCard.hidden = !hasObjectSelection;
  if (objectInspectorContent) objectInspectorContent.hidden = !hasObjectSelection;
  if (!hasObjectSelection) {
    if (objectSelectionId) objectSelectionId.textContent = 'ID: none';
    if (objectStopNameField) objectStopNameField.hidden = true;
    if (objectWaypointGroupField) objectWaypointGroupField.hidden = true;
    if (objectVarNameField) objectVarNameField.hidden = true;
    if (objectDescriptionField) objectDescriptionField.hidden = true;
    if (objectBodyRequiredHint) objectBodyRequiredHint.hidden = true;
    if (objectBodyInput) objectBodyInput.classList.remove('is-invalid');
    if (objectDeleteBtn) {
      objectDeleteBtn.hidden = true;
      objectDeleteBtn.disabled = true;
    }
    if (objectInsertBtn) {
      objectInsertBtn.hidden = true;
      objectInsertBtn.disabled = true;
    }
    closeGuideInsertMenu({ restoreFocus: false });
    closeVariableAutocomplete();
    return;
  }

  const isStopNode = !!node && node.type === 'stop';
  const isReplyNode = !!node && node.type === 'reply';
  const isGuideNode = !!node && node.type === 'bubble';
  const isButtonNode = !!node && node.type === 'button';
  const isLinkSelected = !!link;
  const isImageBubble = isGuideNode && node.kind === 'image';
  const isVideoBubble = isGuideNode && node.kind === 'video';
  const isMediaBubble = isImageBubble || isVideoBubble;
  const BODY_LABELS = { stop: 'NOTES', bubble: 'GUIDE TEXT', reply: 'PLAYER MESSAGE' };

  if (objectInspectorCopy) objectInspectorCopy.textContent = copyText || '';
  if (objectStopNameField) objectStopNameField.hidden = isLinkSelected || !isStopNode;
  if (objectWaypointGroupField) objectWaypointGroupField.hidden = isLinkSelected || !isStopNode;
  if (objectVarNameField) objectVarNameField.hidden = isLinkSelected || !isReplyNode;
  if (objectButtonNameField) objectButtonNameField.hidden = isLinkSelected || !isButtonNode;
  if (objectButtonTargetField) objectButtonTargetField.hidden = isLinkSelected || !isButtonNode;
  if (objectBubbleImageField) objectBubbleImageField.hidden = !isImageBubble;
  if (objectBubbleVideoField) objectBubbleVideoField.hidden = !isVideoBubble;
  if (objectDescriptionField) objectDescriptionField.hidden = isLinkSelected || !node || isButtonNode || isMediaBubble;
  if (objectBodyLabel) {
    objectBodyLabel.textContent = node
      ? (isImageBubble ? 'IMAGE ADDRESS' : isVideoBubble ? 'VIDEO ADDRESS' : (isAnytimeGuideNode(node) ? 'ANYTIME RESPONSE' : (BODY_LABELS[node.type] || 'NOTES')))
      : 'NOTES';
  }
  if (nodeBodyHtmlNote) {
    nodeBodyHtmlNote.hidden = !(node && node.type === 'bubble') || isMediaBubble;
    if (node && node.kind === 'text') {
      nodeBodyHtmlNote.textContent = 'HTML OK. Use INSERT STORED INFO to insert previously stored info.';
    } else {
      nodeBodyHtmlNote.textContent = 'HTML OK.';
    }
  }
  if (objectBodyInfo) objectBodyInfo.hidden = !isStopNode || isLinkSelected;

  if (objectStopNameInput) {
    objectStopNameInput.disabled = !isStopNode;
    objectStopNameInput.value = isStopNode && node ? normalizeWaypointTitle(node.title, '') : '';
  }
  syncWaypointGroupButtons(isStopNode && node ? node.waypointGroup : '', !isStopNode);
  if (objectVarNameInput) {
    objectVarNameInput.disabled = !isReplyNode;
    objectVarNameInput.value = isReplyNode && node ? (node.varName || '') : '';
    objectVarNameInput.placeholder = 'e.g. name';
    objectVarNameInput.classList.toggle('is-invalid', false);
  }
  if (objectVarNameHint) objectVarNameHint.hidden = !isReplyNode;
  refreshVarNameHint();
  if (objectButtonNameInput) {
    objectButtonNameInput.disabled = !isButtonNode;
    objectButtonNameInput.value = isButtonNode && node ? (node.title || '') : '';
  }
  if (objectButtonTargetInput) {
    objectButtonTargetInput.disabled = !isButtonNode;
    objectButtonTargetInput.value = isButtonNode && node ? (node.buttonUrl || '') : '';
  }
  syncReplyModeInputs(node);
  if (objectBodyInput) {
    objectBodyInput.disabled = isLinkSelected || !node || (isReplyNode && !!(node && node.acceptAny));
    if (document.activeElement !== objectBodyInput) {
      objectBodyInput.value = node ? (node.body || '') : '';
    }
    objectBodyInput.placeholder = '';
    objectBodyInput.rows = isImageBubble ? 1 : null;
    objectBodyInput.style.resize = isImageBubble ? 'none' : '';
  }
  if (objectBubbleImageInput) {
    objectBubbleImageInput.disabled = !isImageBubble;
    if (document.activeElement !== objectBubbleImageInput) {
      objectBubbleImageInput.value = isImageBubble ? (node.body || '') : '';
    }
  }
  if (objectBubbleImageOnlinePickBtn) objectBubbleImageOnlinePickBtn.disabled = !isImageBubble;
  if (!isImageBubble) setBubbleImageOnlineMenuOpen(false);
  if (objectBubbleVideoInput) {
    objectBubbleVideoInput.disabled = !isVideoBubble;
    if (document.activeElement !== objectBubbleVideoInput) {
      objectBubbleVideoInput.value = isVideoBubble ? (node.body || '') : '';
    }
  }
  setBubbleImageAssetStatus('');
  updateBubbleImagePreview(isImageBubble ? node : null);
  refreshReplyBodyHint();
  if (!node || node.type !== 'bubble' || document.activeElement !== objectBodyInput) {
    closeVariableAutocomplete();
  }
  if (objectInsertBtn) {
    objectInsertBtn.hidden = isLinkSelected || !isGuideNode || isImageBubble;
    objectInsertBtn.disabled = isLinkSelected || !isGuideNode || isImageBubble;
    objectInsertBtn.textContent = (node && node.kind === 'text') ? 'Insert Stored Info' : 'Insert';
  }
  if (isLinkSelected || !isGuideNode) {
    closeGuideInsertMenu({ restoreFocus: false });
  }
  if (objectDeleteBtn) {
    objectDeleteBtn.hidden = false;
    objectDeleteBtn.disabled = node ? node.type === 'game' : !link;
    objectDeleteBtn.textContent = isStopNode ? 'Erase...' : 'Erase';
  }
  if (objectSelectionId) {
    objectSelectionId.textContent = node
      ? 'ID: ' + formatNodeId(node.id)
      : link
        ? 'ID: ' + String(link.id || '').trim()
        : 'ID: none';
  }
}

function updateSelectionUi(options = {}) {
  const skipRecoverySync = !!options.skipRecoverySync;
  const selectedNode = getNode(state.selectedId);
  const selectedLink = getLink(state.selectedLinkId);
  const gameNode = getGameNode();
  const currentGameEntry = getCurrentHeaderGameEntry() || getCurrentGameArchiveEntry();
  const showGameDetails = !!(gameNode || currentGameEntry);
  if (inspector) inspector.hidden = !showGameDetails;
  objectCard.hidden = !showGameDetails;
  inspectorContent.hidden = !showGameDetails;

  const getInspCopy = key => document.querySelector(`#inspectorCopyStrings [data-copy="${key}"]`)?.textContent.trim() || '';
  const nodeCopy = selectedNode ? (document.querySelector(`#stencilBar [data-stencil="${selectedNode.type}"]`)?.dataset.copy || '') : '';
  const anytimeCopy = selectedNode && isAnytimeReplyNode(selectedNode)
    ? getInspCopy('anytime-reply')
    : selectedNode && isAnytimeGuideNode(selectedNode)
      ? getInspCopy('anytime-guide')
      : '';
  const objectCopyText = selectedNode
    ? (anytimeCopy || nodeCopy || '')
    : selectedLink
      ? getInspCopy('link')
      : getInspCopy('default');
  if (inspectorCopy) {
    inspectorCopy.textContent = showGameDetails ? '' : getInspCopy('default');
    inspectorCopy.hidden = !inspectorCopy.textContent;
  }

  const isGameNode = !!gameNode;
  syncInspectorHosts(selectedNode, selectedLink);
  if (inspectorContent) inspectorContent.classList.add('is-game-details');

  titleField.hidden = !showGameDetails;
  stopNameField.hidden = true;
  varNameField.hidden = true;
  varValuesField.hidden = true;
  descriptionField.hidden = !showGameDetails;
  ifThenField.hidden = true;
  taglineField.hidden = !showGameDetails;

  if (cityField) cityField.hidden = !showGameDetails;
  if (startingLocationField) startingLocationField.hidden = !showGameDetails;
  if (howToPlayField) howToPlayField.hidden = !showGameDetails;
  guideNameField.hidden = !showGameDetails;
  guideBioField.hidden = !showGameDetails;
  guideImageField.hidden = !showGameDetails;
  priceField.hidden = !showGameDetails;
  primaryColorField.hidden = !showGameDetails;
  secondaryColorField.hidden = !showGameDetails;
  if (tertiaryColorField) tertiaryColorField.hidden = !showGameDetails;
  if (quaternaryColorField) quaternaryColorField.hidden = !showGameDetails;
  tagsField.hidden = !showGameDetails;
  if (teamsField) teamsField.hidden = !showGameDetails;
  if (nodeTitleLabelText) nodeTitleLabelText.textContent = 'GAME NAME';
  nodeBodyLabel.textContent = 'GAME DESCRIPTION';
  if (nodeBodyInfo) nodeBodyInfo.hidden = true;
  if (nodeBodyHtmlNote) nodeBodyHtmlNote.hidden = true;

  nodeTitleInput.disabled = !isGameNode;
  stopNameInput.disabled = true;
  varNameInput.disabled = true;
  nodeTaglineInput.disabled = !isGameNode;
  nodeGameLogoInput.disabled = !isGameNode;
  if (gameLogoOnlinePickBtn) gameLogoOnlinePickBtn.disabled = !isGameNode;
  if (!isGameNode) setGameLogoOnlineMenuOpen(false);

  if (nodeCityInput) nodeCityInput.disabled = !isGameNode;
  nodeStartingLocationInput.disabled = !isGameNode;
  nodeHowToPlayInput.disabled = !isGameNode;
  nodeStartingLocationMapBtn.disabled = !isGameNode;
  nodeGuideNameInput.disabled = !isGameNode;
  nodeGuideBioInput.disabled = !isGameNode;
  nodeGuideImageInput.disabled = !isGameNode;
  if (guideImageOnlinePickBtn) guideImageOnlinePickBtn.disabled = !isGameNode;
  if (!isGameNode) setGuideImageOnlineMenuOpen(false);
  nodePriceInput.disabled = !isGameNode;
  primaryColorInput.disabled = !isGameNode;
  primaryColorPickerInput.disabled = !isGameNode;
  secondaryColorInput.disabled = !isGameNode;
  secondaryColorPickerInput.disabled = !isGameNode;
  if (tertiaryColorInput) tertiaryColorInput.disabled = !isGameNode;
  if (tertiaryColorPickerInput) tertiaryColorPickerInput.disabled = !isGameNode;
  if (quaternaryColorInput) quaternaryColorInput.disabled = !isGameNode;
  if (quaternaryColorPickerInput) quaternaryColorPickerInput.disabled = !isGameNode;
  nodeTagNewInput.disabled = !isGameNode;
  nodeTagAddBtn.disabled = !isGameNode;
  teamInputs.forEach(inp => { if (inp) inp.disabled = !isGameNode; });
  nodeBodyInput.disabled = !isGameNode;

  const currentGameArchived = isCurrentGameArchived();
  const currentGameFeatured = isCurrentGameFeatured();
  const hasLoadedGame = !!(currentGameEntry || gameNode);
  const duplicateGameDisabled = !hasLoadedGame
    || !hasSupabaseStore()
    || state.saveUiState === 'saving'
    || state.saveUiState === 'loading'
    || state.duplicateGameActionBusy
    || state.archiveGameActionBusy
    || state.gameEraseActionBusy;
  const archiveGameDisabled = !hasLoadedGame
    || !hasSupabaseStore()
    || state.saveUiState === 'saving'
    || state.saveUiState === 'loading'
    || state.duplicateGameActionBusy
    || state.featureGameActionBusy
    || state.archiveGameActionBusy
    || state.gameEraseActionBusy;
  const featureGameDisabled = !hasLoadedGame
    || state.saveUiState === 'saving'
    || state.saveUiState === 'loading'
    || state.duplicateGameActionBusy
    || state.featureGameActionBusy
    || state.archiveGameActionBusy
    || state.gameEraseActionBusy;
  const showGameEraseAction = hasLoadedGame || currentGameArchived;
  const gameEraseDisabled = !showGameEraseAction
    || !hasSupabaseStore()
    || state.saveUiState === 'saving'
    || state.saveUiState === 'loading'
    || state.duplicateGameActionBusy
    || state.featureGameActionBusy
    || state.archiveGameActionBusy
    || state.gameEraseActionBusy;
  if (duplicateGameBtn) {
    duplicateGameBtn.disabled = duplicateGameDisabled;
    duplicateGameBtn.textContent = state.duplicateGameActionBusy
      ? 'Duplicating...'
      : (state.duplicateGameFeedback ? 'Opened Copy' : 'Duplicate');
    duplicateGameBtn.classList.toggle('is-success', !!state.duplicateGameFeedback && !state.duplicateGameActionBusy);
    duplicateGameBtn.title = !hasSupabaseStore()
      ? 'Supabase is required to duplicate a game'
      : (state.duplicateGameActionBusy ? 'Duplicating game...' : 'Duplicate this game');
    duplicateGameBtn.setAttribute('aria-label', duplicateGameBtn.title);
  }
  if (featureGameBtn) {
    featureGameBtn.disabled = featureGameDisabled;
    featureGameBtn.textContent = state.featureGameActionBusy
      ? (currentGameFeatured ? 'Unfeaturing...' : 'Featuring...')
      : state.featureGameFeedback
        ? (currentGameFeatured ? 'Featured' : 'Unfeatured')
        : (currentGameFeatured ? 'Unfeature' : 'Feature');
    featureGameBtn.classList.toggle('is-success', !!state.featureGameFeedback && !state.featureGameActionBusy);
    featureGameBtn.title = state.featureGameActionBusy
        ? (currentGameFeatured ? 'Removing featured status...' : 'Setting featured status...')
        : currentGameFeatured
          ? 'Remove the Featured tag from this game'
          : 'Add the Featured tag to this game';
    featureGameBtn.setAttribute('aria-label', featureGameBtn.title);
  }
  if (archiveGameBtn) {
    archiveGameBtn.disabled = archiveGameDisabled;
    archiveGameBtn.textContent = state.archiveGameActionBusy
      ? (currentGameArchived ? 'Unarchiving...' : 'Archiving...')
      : (currentGameArchived ? 'Unarchive' : 'Archive');
    archiveGameBtn.classList.toggle('is-success', !!state.archiveGameFeedback && !state.archiveGameActionBusy);
    archiveGameBtn.title = !hasSupabaseStore()
      ? 'Supabase is required to archive or unarchive a game'
      : state.archiveGameActionBusy
        ? (currentGameArchived ? 'Unarchiving game...' : 'Archiving game...')
        : (currentGameArchived ? 'Unarchive the current game' : 'Archive the current game');
    archiveGameBtn.setAttribute('aria-label', archiveGameBtn.title);
  }
  if (duplicateGameStatus) {
    duplicateGameStatus.hidden = !state.duplicateGameFeedback;
    duplicateGameStatus.textContent = state.duplicateGameFeedback;
  }
  deleteBtn.hidden = true;
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Erase';
  if (gameEraseBtn) {
    gameEraseBtn.hidden = !showGameEraseAction;
    gameEraseBtn.disabled = gameEraseDisabled;
    gameEraseBtn.title = !hasSupabaseStore()
      ? 'Supabase is required to erase or archive a game'
      : (state.gameEraseActionBusy ? 'Working...' : 'Erase or archive game');
    gameEraseBtn.setAttribute('aria-label', gameEraseBtn.title);
  }

  nodeTitleInput.value = isGameNode && gameNode ? gameNode.title : (currentGameEntry ? (currentGameEntry.name || '') : '');
  stopNameInput.value = '';
  varNameInput.value = '';
  varNameInput.placeholder = 'e.g. name';
  varValueInputs.forEach((input) => { input.value = ''; input.disabled = true; });
  varCorrectRadios.forEach((radio, i) => {
    radio.checked = false;
    radio.disabled = true;
  });
  nodeTaglineInput.value = isGameNode && gameNode ? (gameNode.tagline || '') : '';
  nodeGameLogoInput.value = isGameNode && gameNode ? (gameNode.logoUrl || '') : '';
  setGameLogoAssetStatus('');
  if (gameLogoOnlineMenu && isGameNode && !gameLogoOnlineMenu.hidden && Array.isArray(gameLogoOnlineAssetsCache)) {
    populateGameLogoOnlineMenu(gameLogoOnlineAssetsCache);
  }

  if (nodeCityInput) nodeCityInput.value = isGameNode && gameNode ? (gameNode.city || '') : '';
  nodeStartingLocationInput.value = isGameNode && gameNode ? (gameNode.startingLocation || '') : '';
  nodeHowToPlayInput.value = isGameNode && gameNode ? (gameNode.howToPlay || '') : '';
  nodeGuideNameInput.value = isGameNode && gameNode ? (gameNode.guideName || '') : '';
  nodeGuideBioInput.value = isGameNode && gameNode ? (gameNode.guideBio || '') : '';
  nodeGuideImageInput.value = isGameNode && gameNode ? (gameNode.guideImageUrl || '') : '';
  setGuideImageAssetStatus('');
  if (guideImageOnlineMenu && isGameNode && !guideImageOnlineMenu.hidden && Array.isArray(gameLogoOnlineAssetsCache)) {
    populateGuideImageOnlineMenu(gameLogoOnlineAssetsCache);
  }
  nodePriceInput.value = isGameNode && gameNode ? (gameNode.price || '') : '';
  updateGameLogoPreview(gameNode);
  updateGuideImagePreview(gameNode);
  const currentColors = getCurrentGameColors();
  primaryColorInput.value = showGameDetails ? currentColors.primaryColor : '';
  primaryColorInput.classList.remove('is-invalid');
  primaryColorPickerInput.value = colorValueToHex(currentColors.primaryColor, '#5468a7');
  secondaryColorInput.value = showGameDetails ? currentColors.secondaryColor : '';
  secondaryColorInput.classList.remove('is-invalid');
  secondaryColorPickerInput.value = colorValueToHex(currentColors.secondaryColor, '#243256');
  let tertiaryColorValue = (showGameDetails && gameNode)
    ? normalizeTertiaryColorValue(gameNode.tertiaryColor)
    : '';
  if (isGameNode && gameNode) {
    if (!tertiaryColorValue) {
      tertiaryColorValue = normalizeTertiaryColorValue(
        getEffectiveTertiary(currentColors.primaryColor || '#5468a7', currentColors.secondaryColor || '#243256')
      );
    }
    gameNode.tertiaryColor = tertiaryColorValue;
  }
  if (tertiaryColorInput) {
    tertiaryColorInput.value = tertiaryColorValue;
    tertiaryColorInput.classList.remove('is-invalid');
  }
  if (tertiaryColorPickerInput) {
    tertiaryColorPickerInput.value = colorValueToHex(tertiaryColorValue, '#ffffff');
  }
  const quaternaryColorFallback = getQuaternaryColorFallback(currentColors.primaryColor, currentColors.secondaryColor);
  const quaternaryColorValue = (showGameDetails && gameNode)
    ? normalizeQuaternaryColorValue(gameNode.quaternaryColor, quaternaryColorFallback)
    : '';
  if (quaternaryColorInput) {
    quaternaryColorInput.value = quaternaryColorValue;
    quaternaryColorInput.classList.remove('is-invalid');
  }
  if (quaternaryColorPickerInput) {
    quaternaryColorPickerInput.value = colorValueToHex(quaternaryColorValue, quaternaryColorFallback);
  }
  nodeTagNewInput.value = '';
  renderTagPicker(gameNode);
  teamInputs.forEach((inp, i) => {
    if (inp) inp.value = isGameNode && gameNode ? (getNormalizedTeamValues(gameNode)[i] || '') : '';
  });
  nodeBodyInput.value = gameNode ? (gameNode.body || '') : '';
  nodeBodyInput.placeholder = '';
  selectionId.textContent = currentGameEntry && currentGameEntry.id
    ? '(ID: ' + String(currentGameEntry.id).trim() + ')'
    : '(ID: none)';
  selectionId.hidden = !showGameDetails;
  syncDetailsSectionVisibility();
  if (document.activeElement !== objectBodyInput) closeVariableAutocomplete();
  updateObjectInspectorUi(selectedNode, selectedLink, objectCopyText);
  updateActionUi();
  refreshInspectorWindowUi();
  if (!skipRecoverySync) scheduleRecoverySync();
}

function getAutoLinkSourceNode() {
  const selectedNode = state.selectedId ? getNode(state.selectedId) : null;
  if (selectedNode) return selectedNode;
  return state.doc.nodes.length ? state.doc.nodes[state.doc.nodes.length - 1] : null;
}

function hasOutgoingLinkOnPort(nodeId, fromPort, links = state.doc.links) {
  const normalizedPort = normalizeFromPort(getNode(nodeId) || parseTypedNodeId(nodeId)?.type, fromPort);
  return links.some((link) => link.from === nodeId && normalizeFromPort(getNode(nodeId) || parseTypedNodeId(nodeId)?.type, link.fromPort) === normalizedPort);
}

function getAutoLinkPort(node) {
  if (!node) return null;
  const ports = getNodeOutPorts(node);
  return ports.find((port) => !hasOutgoingLinkOnPort(node.id, port)) || null;
}

function getConnectedPlacementPosition(type, sourceNode, fromPort) {
  const config = TYPE_CONFIG[type];
  const bounds = getPlacementBounds(config.width, config.height);

  const x = normalizeFromPort(sourceNode, fromPort) === 'out-bottom'
    ? sourceNode.x
    : sourceNode.x + sourceNode.width;
  const y = normalizeFromPort(sourceNode, fromPort) === 'out-bottom'
    ? sourceNode.y + sourceNode.height
    : sourceNode.y;

  return {
    x: clamp(snap(x), bounds.minX, bounds.maxX),
    y: clamp(snap(y), bounds.minY, bounds.maxY)
  };
}

function getPuzzlePlacementPosition(type, sourceNode, preferredPort = null) {
  const config = TYPE_CONFIG[type];
  const bounds = getPlacementBounds(config.width, config.height);

  if (type === 'game') {
    const slot = getGameHomeSlot();
    if (isAutoPlacementAvailable(slot.x, slot.y, config.width, config.height)) {
      return slot;
    }
  }

  if (sourceNode) {
    const fromPort = preferredPort || getAutoLinkPort(sourceNode) || getNodeOutPorts(sourceNode)[0];
    if (fromPort) {
      const preferred = getConnectedPlacementPosition(type, sourceNode, fromPort);
      if (isAutoPlacementAvailable(preferred.x, preferred.y, config.width, config.height)) {
        return preferred;
      }
    }
  }

  const columns = getPlacementGridColumns();
  const rows = getPlacementGridRows();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!isPlacementSlotAllowed(type, col, row)) continue;
      const slot = getGridSlotPosition(type, col, row);
      if (isAutoPlacementAvailable(slot.x, slot.y, config.width, config.height)) {
        return slot;
      }
    }
  }

  if (sourceNode) {
    const fallback = preferredPort || getNodeOutPorts(sourceNode)[0] || 'out-right';
    return getConnectedPlacementPosition(type, sourceNode, fallback);
  }

  return {
    x: clamp(snap((getPhoneStageSize().width / 2) - (config.width / 2)), bounds.minX, bounds.maxX),
    y: clamp(snap((getPhoneStageSize().height / 2) - (config.height / 2)), bounds.minY, bounds.maxY)
  };
}

function snapLinkedNodeToSource(node, sourceNode, fromPort) {
  if (!node || !sourceNode || !fromPort) return false;
  const preferred = getConnectedPlacementPosition(node.type, sourceNode, fromPort);
  if (!isAutoPlacementAvailable(preferred.x, preferred.y, node.width, node.height, node.id)) return false;
  node.x = preferred.x;
  node.y = preferred.y;
  return true;
}

function layoutOutgoingSubtree(nodeId, visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) return;
  visited.add(nodeId);

  const sourceNode = getNode(nodeId);
  if (!sourceNode) return;

  getOutgoingLinks(nodeId)
    .slice()
    .sort((a, b) => normalizeFromPort(sourceNode, a.fromPort).localeCompare(normalizeFromPort(sourceNode, b.fromPort)))
    .forEach((link) => {
      const targetNode = getNode(link.to);
      if (!targetNode) return;
      snapLinkedNodeToSource(targetNode, sourceNode, link.fromPort);
      const targetEl = nodeEls.get(targetNode.id);
      if (targetEl) positionNodeElement(targetNode, targetEl);
      layoutOutgoingSubtree(targetNode.id, visited);
    });
}

function getDockCandidateForNode(node, desiredX, desiredY, ignoreNodeIds = null) {
  if (!node || node.type === 'game') return null;

  const threshold = 54;
  let best = null;
  let bestDistance = threshold;

  state.doc.nodes.forEach((sourceNode) => {
    if (!sourceNode || sourceNode.id === node.id) return;
    if (!canNodeConnectTo(sourceNode, node)) return;

    getNodeOutPorts(sourceNode).forEach((fromPort) => {
      if (hasOutgoingLinkOnPort(sourceNode.id, fromPort)) return;
      const position = getConnectedPlacementPosition(node.type, sourceNode, fromPort);
      if (!isAutoPlacementAvailable(position.x, position.y, node.width, node.height, ignoreNodeIds || node.id)) return;

      const distance = Math.hypot(position.x - desiredX, position.y - desiredY);
      if (distance > bestDistance) return;

      bestDistance = distance;
      best = {
        sourceId: sourceNode.id,
        fromPort,
        x: position.x,
        y: position.y
      };
    });
  });

  return best;
}

function tryAutoConnectNewNode(node, sourceNode) {
  if (!node || !sourceNode || sourceNode.id === node.id) return;

  const fromPort = getAutoLinkPort(sourceNode);
  if (!fromPort) return;

  try {
    const created = createLink(sourceNode.id, node.id, fromPort);
    if (created) snapLinkedNodeToSource(node, sourceNode, fromPort);
  } catch (error) {
  }
}

function isAutoPlacementAvailable(x, y, width, height, ignoreNodeId = null) {
  const bounds = getPlacementBounds(width, height);
  const shouldIgnore = ignoreNodeMatcher(ignoreNodeId);

  if (x < bounds.minX || y < bounds.minY || x > bounds.maxX || y > bounds.maxY) return false;

  return !state.doc.nodes.some((node) =>
    !shouldIgnore(node.id) &&
    x < node.x + node.width + AUTO_PLACE_GAP_X &&
    x + width + AUTO_PLACE_GAP_X > node.x &&
    y < node.y + node.height + AUTO_PLACE_GAP_Y &&
    y + height + AUTO_PLACE_GAP_Y > node.y
  );
}

function maybeSnapToMajorGrid(type, x, y, ignoreNodeId = null) {
  let best = null;
  let bestDistance = Infinity;
  const columns = getPlacementGridColumns();
  const rows = getPlacementGridRows();

  if (type === 'game') {
    const slot = getGameHomeSlot();
    if (isAutoPlacementAvailable(slot.x, slot.y, TYPE_CONFIG.game.width, TYPE_CONFIG.game.height, ignoreNodeId)) {
      return slot;
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!isPlacementSlotAllowed(type, col, row)) continue;
      const slot = getGridSlotPosition(type, col, row);
      const dx = Math.abs(slot.x - x);
      const dy = Math.abs(slot.y - y);
      if (dx > MAJOR_GRID_SNAP_THRESHOLD || dy > MAJOR_GRID_SNAP_THRESHOLD) continue;
      if (!isAutoPlacementAvailable(slot.x, slot.y, TYPE_CONFIG[type].width, TYPE_CONFIG[type].height, ignoreNodeId)) continue;
      const distance = dx + dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slot;
      }
    }
  }

  return best || { x, y };
}

function getAutoPlacementPosition(type, sourceNode) {
  return getPuzzlePlacementPosition(type, sourceNode);
}

function getLegacyGridPlacementPosition(type, sourceNode) {
  const config = TYPE_CONFIG[type];
  const bounds = getPlacementBounds(config.width, config.height);
  const columns = getPlacementGridColumns();
  const rows = getPlacementGridRows();

  if (type === 'game') {
    const slot = getGameHomeSlot();
    if (isAutoPlacementAvailable(slot.x, slot.y, config.width, config.height)) {
      return slot;
    }
  }

  if (sourceNode) {
    const cell = getNodeGridCell(sourceNode);
    if (cell && cell.col < columns - 1) {
      const rightSlot = getGridSlotPosition(type, cell.col + 1, cell.row);
      if (isAutoPlacementAvailable(rightSlot.x, rightSlot.y, config.width, config.height)) {
        return rightSlot;
      }
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!isPlacementSlotAllowed(type, col, row)) continue;
      const slot = getGridSlotPosition(type, col, row);
      if (isAutoPlacementAvailable(slot.x, slot.y, config.width, config.height)) {
        return slot;
      }
    }
  }

  if (sourceNode) {
    return {
      x: clamp(snap(sourceNode.x + sourceNode.width + AUTO_PLACE_GAP_X), bounds.minX, bounds.maxX),
      y: clamp(snap(sourceNode.y), bounds.minY, bounds.maxY)
    };
  }

  const rect = viewport.getBoundingClientRect();
  const centerPoint = phonePointFromClient(
    rect.left + (rect.width / 2),
    rect.top + (rect.height / 2)
  );

  return {
    x: clamp(snap(centerPoint.x - (config.width / 2)), bounds.minX, bounds.maxX),
    y: clamp(snap(centerPoint.y - (config.height / 2)), bounds.minY, bounds.maxY)
  };
}

function duplicateNode(nodeId) {
  const source = getNode(nodeId);
  if (!source || source.type === 'game') return null;
  if (isAnytimeNode(source)) return duplicateAnytimePair(source);

  const placement = getAutoPlacementPosition(source.type, source);
  const isThreadNode = source.type === 'bubble' || source.type === 'reply' || source.type === 'stop' || source.type === 'button';
  const sourceOrderIndex = normalizeNodeOrderIndex(source.orderIndex);
  const duplicateOrderIndex = isThreadNode && sourceOrderIndex != null
    ? sourceOrderIndex + 50
    : (state.doc.nodes.reduce((maxOrderIndex, node) => {
        const value = normalizeNodeOrderIndex(node && node.orderIndex);
        return value == null ? maxOrderIndex : Math.max(maxOrderIndex, value);
      }, 0) + 100);
  const duplicate = {
    id: makeId(source.type),
    type: source.type,
    x: placement.x,
    y: placement.y,
    width: TYPE_CONFIG[source.type].width,
    height: TYPE_CONFIG[source.type].height,
    title: usesNodeTitle(source.type) ? source.title : '',
    tagline: source.tagline || '',
    startingLocation: source.startingLocation || '',
    howToPlay: source.howToPlay || '',
    guideName: source.guideName || '',
    guideBio: source.guideBio || '',
    guideImageUrl: source.guideImageUrl || '',
    price: source.price || '',
    builderNotes: source.builderNotes || '',
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
    ...getTeamFieldState(source),
    waypointGroup: source.type === 'stop' ? normalizeWaypointGroup(source.waypointGroup) : '',
    body: source.body || '',
    buttonUrl: source.buttonUrl || '',
    tertiaryColor: source.tertiaryColor || '',
    quaternaryColor: source.quaternaryColor || '',
    varName: source.varName || '',
    acceptAny: !!source.acceptAny,
    anytime: false,
    anytimePairId: '',
    rotation: getNodeRotation(source),
    orderIndex: duplicateOrderIndex
  };
  if (duplicate.type === 'reply' && duplicate.varName) {
    duplicate.varName = makeUniqueReplyVariableName(duplicate.varName, duplicate.id);
  }

  state.doc.nodes.push(duplicate);
  tryAutoConnectNewNode(duplicate, source);
  selectNode(duplicate.id);
  renderAll();
  return duplicate;
}

function addNode(type, x, y, options = {}) {
  if (type === 'game' && hasGameNode()) {
    return null;
  }

  const sourceNode = getAutoLinkSourceNode();
  const node = createNode(type, x, y);
  if (options.kind) node.kind = options.kind;
  if (type === 'game') {
    const slot = getGameHomeSlot();
    node.x = slot.x;
    node.y = slot.y;
  }
  const bounds = getPlacementBounds(node.width, node.height);
  const clampedX = clamp(node.x, bounds.minX, bounds.maxX);
  const clampedY = clamp(node.y, bounds.minY, bounds.maxY);
  const snapped = options.skipMajorSnap
    ? { x: clampedX, y: clampedY }
    : maybeSnapToMajorGrid(type, clampedX, clampedY);
  node.x = snapped.x;
  node.y = snapped.y;
  state.doc.nodes.push(node);
  tryAutoConnectNewNode(node, sourceNode);
  selectNode(node.id);
  renderAll();
  return node;
}

function getAutoAnytimePairPlacement() {
  const replyConfig = TYPE_CONFIG.reply;
  const bubbleConfig = TYPE_CONFIG.bubble;
  const bounds = getPlacementBounds(replyConfig.width, replyConfig.height);
  const columns = getPlacementGridColumns();
  const rows = getPlacementGridRows();

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!isPlacementSlotAllowed('reply', col, row)) continue;
      const slot = getGridSlotPosition('reply', col, row);
      const x = clamp(slot.x, bounds.minX, bounds.maxX);
      const y = clamp(slot.y, bounds.minY, bounds.maxY);
      if (!isAutoPlacementAvailable(x, y, replyConfig.width, replyConfig.height)) continue;
      const tempReply = {
        type: 'reply',
        x,
        y,
        width: replyConfig.width,
        height: replyConfig.height,
        anytime: true
      };
      const bubblePos = getConnectedPlacementPosition('bubble', tempReply, 'out-right');
      if (!isAutoPlacementAvailable(bubblePos.x, bubblePos.y, bubbleConfig.width, bubbleConfig.height)) continue;
      return {
        reply: { x, y },
        bubble: bubblePos
      };
    }
  }

  const replyFallback = getPuzzlePlacementPosition('reply', null);
  const tempReply = {
    type: 'reply',
    x: replyFallback.x,
    y: replyFallback.y,
    width: replyConfig.width,
    height: replyConfig.height,
    anytime: true
  };
  return {
    reply: replyFallback,
    bubble: getConnectedPlacementPosition('bubble', tempReply, 'out-right')
  };
}

function insertAnytimePairAt(replyPosition, bubblePosition, sourceReply = null, sourceBubble = null) {
  const pairId = makeAnytimePairId();
  const replyNode = createNode('reply', replyPosition.x, replyPosition.y);
  replyNode.anytime = true;
  replyNode.anytimePairId = pairId;
  replyNode.body = sourceReply ? (sourceReply.body || '') : '';
  replyNode.varName = sourceReply
    ? (sourceReply.varName ? makeUniqueReplyVariableName(sourceReply.varName, replyNode.id) : '')
    : '';

  const bubbleNode = createNode('bubble', bubblePosition.x, bubblePosition.y);
  bubbleNode.anytime = true;
  bubbleNode.anytimePairId = pairId;
  bubbleNode.body = sourceBubble ? (sourceBubble.body || '') : '';
  bubbleNode.rotation = sourceBubble ? getNodeRotation(sourceBubble) : 0;

  state.doc.nodes.push(replyNode, bubbleNode);
  createLink(replyNode.id, bubbleNode.id, 'out-right');
  selectNode(replyNode.id);
  renderAll();
  return { reply: replyNode, bubble: bubbleNode };
}

function addAnytimePairToVisiblePhone() {
  const placement = getAutoAnytimePairPlacement();
  return insertAnytimePairAt(placement.reply, placement.bubble);
}

function enableAnytimeForReply(replyNode) {
  if (!replyNode || replyNode.type !== 'reply') return false;
  if (isAnytimeReplyNode(replyNode)) return true;

  if (getOutgoingLinks(replyNode.id).length) {
    return false;
  }

  const bubblePosition = getConnectedPlacementPosition('bubble', {
    ...replyNode,
    anytime: true
  }, 'out-right');
  const bubbleConfig = TYPE_CONFIG.bubble;

  if (!isAutoPlacementAvailable(bubblePosition.x, bubblePosition.y, bubbleConfig.width, bubbleConfig.height, replyNode.id)) {
    return false;
  }

  const pairId = makeAnytimePairId();
  replyNode.anytime = true;
  replyNode.anytimePairId = pairId;

  const bubbleNode = createNode('bubble', bubblePosition.x, bubblePosition.y);
  bubbleNode.anytime = true;
  bubbleNode.anytimePairId = pairId;
  state.doc.nodes.push(bubbleNode);

  if (!createLink(replyNode.id, bubbleNode.id, 'out-right')) {
    replyNode.anytime = false;
    replyNode.anytimePairId = '';
    state.doc.nodes = state.doc.nodes.filter((node) => node.id !== bubbleNode.id);
    return false;
  }

  return true;
}

function disableAnytimeForReply(replyNode) {
  if (!replyNode || replyNode.type !== 'reply') return false;

  const pairId = getAnytimePairId(replyNode);
  if (!pairId) {
    replyNode.anytime = false;
    replyNode.anytimePairId = '';
    return true;
  }

  const pairedGuideIds = new Set(
    state.doc.nodes
      .filter((node) => node.id !== replyNode.id && getAnytimePairId(node) === pairId)
      .map((node) => node.id)
  );

  state.doc.nodes = state.doc.nodes.filter((node) => !pairedGuideIds.has(node.id));
  state.doc.links = state.doc.links.filter((link) =>
    !pairedGuideIds.has(link.from) &&
    !pairedGuideIds.has(link.to) &&
    !(link.from === replyNode.id && pairedGuideIds.has(link.to))
  );

  replyNode.anytime = false;
  replyNode.anytimePairId = '';
  state.selectedId = replyNode.id;
  state.selectedLinkId = null;
  return true;
}

function getReplyMode(node) {
  if (!node || node.type !== 'reply') return 'normal';
  if (node.acceptAny) return 'anyanswer';
  return 'normal';
}

function getReplyTiming(node) {
  if (!node || node.type !== 'reply') return 'inline';
  return !!node.anytime ? 'anytime' : 'inline';
}

function syncReplyModeInputs(node) {
  const isReplyNode = !!node && node.type === 'reply';
  const isLegacyAnytimeReply = isReplyNode && isLegacyAnytimeReplyNode(node);
  const mode = isReplyNode ? getReplyMode(node) : 'normal';
  const timing = isReplyNode ? getReplyTiming(node) : 'inline';

  if (objectReplyModeField) objectReplyModeField.hidden = !isReplyNode;
  if (objectReplyTimingField) objectReplyTimingField.hidden = !(isReplyNode && !isLegacyAnytimeReply && mode === 'normal');
  if (objectBodyAnswerNote) objectBodyAnswerNote.hidden = !(isReplyNode && mode === 'normal');
  if (objectBodyHtmlNote) objectBodyHtmlNote.hidden = !(node && node.type === 'bubble') || (node && (node.kind === 'image' || node.kind === 'video'));
  const isButtonNode = !!node && node.type === 'button';
  if (objectDescriptionField) objectDescriptionField.hidden = isButtonNode || (isReplyNode && mode === 'anyanswer') || (node && node.type === 'bubble' && (node.kind === 'image' || node.kind === 'video'));

  [
    [objectReplyModeNormalInput, 'normal'],
    [objectReplyModeAnyAnswerInput, 'anyanswer'],
    [objectReplyModeAnytimeInput, 'anytime']
  ].forEach(([input, value]) => {
    if (!input) return;
    input.checked = isReplyNode && mode === value;
    input.disabled = !isReplyNode;
  });

  [
    [objectReplyTimingInlineInput, 'inline'],
    [objectReplyTimingAnytimeInput, 'anytime']
  ].forEach(([input, value]) => {
    if (!input) return;
    input.checked = isReplyNode && !isLegacyAnytimeReply && mode === 'normal' && timing === value;
    input.disabled = !isReplyNode || isLegacyAnytimeReply || mode !== 'normal';
  });
}

function syncWaypointGroupButtons(groupValue, disabled = false) {
  const normalizedGroup = normalizeWaypointGroup(groupValue);
  objectWaypointGroupButtons.forEach((button) => {
    const buttonGroup = normalizeWaypointGroup(button && button.dataset ? button.dataset.waypointGroupBtn : '');
    const isActive = !disabled && !!buttonGroup && buttonGroup === normalizedGroup;
    button.disabled = !!disabled;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function duplicateAnytimePair(node) {
  const pairId = getAnytimePairId(node);
  if (!pairId) return null;
  const sourceReply = state.doc.nodes.find((candidate) => isAnytimeReplyNode(candidate) && candidate.anytimePairId === pairId) || null;
  const sourceBubble = state.doc.nodes.find((candidate) => isAnytimeGuideNode(candidate) && candidate.anytimePairId === pairId) || null;
  if (!sourceReply) return null;
  const placement = getAutoAnytimePairPlacement();
  return insertAnytimePairAt(placement.reply, placement.bubble, sourceReply, sourceBubble);
}

function removeAnytimePair(pairId) {
  const normalizedPairId = String(pairId || '').trim();
  if (!normalizedPairId) return false;
  const pairNodeIds = new Set(
    state.doc.nodes
      .filter((node) => getAnytimePairId(node) === normalizedPairId)
      .map((node) => node.id)
  );
  if (!pairNodeIds.size) return false;
  state.doc.nodes = state.doc.nodes.filter((node) => !pairNodeIds.has(node.id));
  state.doc.links = state.doc.links.filter((link) => !pairNodeIds.has(link.from) && !pairNodeIds.has(link.to));
  state.selectedLinkId = null;
  state.selectedId = state.doc.nodes.length ? state.doc.nodes[state.doc.nodes.length - 1].id : null;
  return true;
}

function removeNodeIds(nodeIds) {
  const idsToRemove = new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  if (!idsToRemove.size) return false;
  state.doc.nodes = state.doc.nodes.filter((node) => !idsToRemove.has(node.id));
  state.doc.links = state.doc.links.filter((link) => !idsToRemove.has(link.from) && !idsToRemove.has(link.to));
  state.selectedLinkId = null;
  state.selectedId = state.doc.nodes.length ? state.doc.nodes[state.doc.nodes.length - 1].id : null;
  return true;
}

function getWaypointBundleNodeIds(stopNodeId) {
  const group = getWaypointConversationGroupForNode(stopNodeId);
  return group && Array.isArray(group.nodes)
    ? group.nodes.map((node) => node.id)
    : [];
}

async function removeSelectedNode() {
  if (!state.selectedId) return;
  const selectedNode = getNode(state.selectedId);
  if (selectedNode && selectedNode.type === 'game') return;
  if (selectedNode && getAnytimePairId(selectedNode)) {
    if (removeAnytimePair(selectedNode.anytimePairId)) renderAll();
    return;
  }
  if (selectedNode && selectedNode.type === 'stop') {
    const action = await openWaypointEraseDialog();
    if (action === 'waypoint-only') {
      removeNodeIds([selectedNode.id]);
      renderAll();
    } else if (action === 'waypoint-and-bubbles') {
      removeNodeIds(getWaypointBundleNodeIds(selectedNode.id));
      renderAll();
    }
    return;
  }
  removeNodeIds([state.selectedId]);
  renderAll();
}

function removeSelectedLink() {
  if (!state.selectedLinkId) return;
  const linkId = state.selectedLinkId;
  const link = getLink(linkId);
  if (isLockedAnytimePairLink(link)) {
    clearSelection();
    renderAll();
    return;
  }
  state.doc.links = state.doc.links.filter((link) => link.id !== linkId);
  clearSelection();
  renderAll();
}

function startStencilDrag(type, event, kind = '') {
  if (type === 'game' && hasGameNode()) {
    return;
  }
  const config = TYPE_CONFIG[type];
  const threadWidth = PHONE_DEVICE_WIDTH - (PHONE_THREAD_SIDE_PADDING * 2);
  const ghostNode = {
    id: 'preview',
    type,
    width: config.width,
    height: config.height,
    title: config.title,
    body: config.body
  };
  if (THREAD_LAYOUT_ENABLED && isPhoneThreadNode(ghostNode)) {
    const ghostSize = getPhoneBubbleSize(
      ghostNode,
      type === 'stop' ? threadWidth : PHONE_BUBBLE_MAX_WIDTH
    );
    ghostNode.width = ghostSize.width;
    ghostNode.height = ghostSize.height;
  }
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost node-shell dragging node--' + type;
  ghost.style.width = ghostNode.width + 'px';
  ghost.style.height = ghostNode.height + 'px';
  if (type === 'bubble') ghost.style.setProperty('--drag-tilt', '-1.15deg');
  if (type === 'reply') ghost.style.setProperty('--drag-tilt', '1.15deg');
  if (type === 'stop') ghost.style.setProperty('--drag-tilt', '0deg');
  ghost.innerHTML = buildNodeMarkup(ghostNode);
  document.body.appendChild(ghost);
  positionGhost(ghost, event.clientX, event.clientY);

  state.stencilDrag = {
    type,
    kind,
    ghostEl: ghost
  };
  viewport.classList.add('drop-ready');
}

function startStencilPress(type, event, kind = '') {
  if (!TYPE_CONFIG[type]) return;
  if (type === 'game' && hasGameNode()) return;
  state.stencilPress = {
    type,
    kind,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY
  };
}

function maybeStartStencilDrag(event) {
  const press = state.stencilPress;
  if (!press || state.stencilDrag) return;
  if (press.pointerId != null && event.pointerId != null && press.pointerId !== event.pointerId) return;
  const movedEnough =
    Math.abs(event.clientX - press.startClientX) >= STENCIL_DRAG_START_DISTANCE
    || Math.abs(event.clientY - press.startClientY) >= STENCIL_DRAG_START_DISTANCE;
  if (!movedEnough) return;
  state.stencilPress = null;
  startStencilDrag(press.type, event, press.kind || '');
}

function stopStencilDrag(clientX, clientY) {
  if (!state.stencilDrag) return;
  const drag = state.stencilDrag;
  const point = phonePointFromClient(clientX, clientY);

  if (point.inside) {
    const config = TYPE_CONFIG[drag.type];
    addNode(drag.type, point.x - config.width / 2, point.y - config.height / 2, { kind: drag.kind || '' });
  }

  drag.ghostEl.remove();
  state.stencilDrag = null;
  viewport.classList.remove('drop-ready');
}

function cancelStencilDrag() {
  if (!state.stencilDrag) return;
  state.stencilDrag.ghostEl.remove();
  state.stencilDrag = null;
  viewport.classList.remove('drop-ready');
}

function clearStencilPress() {
  state.stencilPress = null;
}

function clearWaypointLibraryPress() {
  state.waypointLibraryPress = null;
}

function buildWaypointLibraryGhostMarkup(entry) {
  return buildWaypointLibraryCardMarkup(entry);
}

function startWaypointLibraryDrag(entry, event) {
  if (!entry) return;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = '220px';
  ghost.innerHTML = buildWaypointLibraryGhostMarkup(entry);
  document.body.appendChild(ghost);
  positionGhost(ghost, event.clientX, event.clientY);
  state.waypointLibraryDrag = {
    entryId: entry.id,
    ghostEl: ghost
  };
  state.waypointLibrarySuppressClick = true;
  viewport.classList.add('drop-ready');
}

function maybeStartWaypointLibraryDrag(event) {
  const press = state.waypointLibraryPress;
  if (!press || state.waypointLibraryDrag) return;
  if (press.pointerId != null && event.pointerId != null && press.pointerId !== event.pointerId) return;
  const movedEnough =
    Math.abs(event.clientX - press.startClientX) >= STENCIL_DRAG_START_DISTANCE
    || Math.abs(event.clientY - press.startClientY) >= STENCIL_DRAG_START_DISTANCE;
  if (!movedEnough) return;
  const entry = getWaypointLibraryEntry(press.entryId);
  clearWaypointLibraryPress();
  if (!entry) return;
  startWaypointLibraryDrag(entry, event);
}

function stopWaypointLibraryDrag(clientX, clientY) {
  if (!state.waypointLibraryDrag) return;
  const drag = state.waypointLibraryDrag;
  const point = phonePointFromClient(clientX, clientY);
  if (point.inside) {
    insertWaypointLibraryEntry(drag.entryId);
  }
  drag.ghostEl.remove();
  state.waypointLibraryDrag = null;
  viewport.classList.remove('drop-ready');
}

function cancelWaypointLibraryDrag() {
  if (!state.waypointLibraryDrag) return;
  state.waypointLibraryDrag.ghostEl.remove();
  state.waypointLibraryDrag = null;
  viewport.classList.remove('drop-ready');
}

function makeManualLinkId() {
  return 'link-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

function insertWaypointLibraryEntry(entryId) {
  const entry = getWaypointLibraryEntry(entryId);
  if (!entry) return null;
  if (!hasGameNode()) {
    window.alert('Open or create a game first.');
    return null;
  }

  const sourceNodes = getSortedConversationNodesFromList(entry.nodes, entry.nodes);
  if (!sourceNodes.length) return null;

  const existingIds = new Set(state.doc.nodes.map((node) => node.id));
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]));
  const idMap = new Map();
  sourceNodes.forEach((sourceNode) => {
    idMap.set(sourceNode.id, makeId(sourceNode.type, state.nextNodeNumbers, existingIds));
  });

  const nextOrderIndexBase = state.doc.nodes.reduce((maxOrderIndex, node) => {
    const value = normalizeNodeOrderIndex(node && node.orderIndex);
    return value == null ? maxOrderIndex : Math.max(maxOrderIndex, value);
  }, 0) + 100;

  const clonedNodes = sourceNodes.map((sourceNode, index) => {
    const nextId = idMap.get(sourceNode.id);
    const clonedNode = normalizeNode({ ...sourceNode, id: nextId }, sourceNode.type, nextId);
    clonedNode.orderIndex = nextOrderIndexBase + (index * 100);
    clonedNode.x = sourceNode.x;
    clonedNode.y = sourceNode.y;
    if (clonedNode.type === 'reply' && normalizeVariableName(clonedNode.varName)) {
      clonedNode.varName = makeUniqueReplyVariableName(clonedNode.varName, clonedNode.id);
    }
    return clonedNode;
  });

  const clonedLinks = (Array.isArray(entry.links) ? entry.links : [])
    .map((link) => {
      const fromId = idMap.get(link.from);
      const toId = idMap.get(link.to);
      const fromNode = sourceById.get(link.from) || null;
      if (!fromId || !toId) return null;
      return {
        id: makeManualLinkId(),
        from: fromId,
        to: toId,
        fromPort: normalizeFromPort(fromNode || parseTypedNodeId(link.from)?.type, link.fromPort)
      };
    })
    .filter(Boolean);

  state.doc.nodes.push(...clonedNodes);
  state.doc.links.push(...clonedLinks);

  const firstInsertedNode = clonedNodes.find((node) => node.type === 'stop') || clonedNodes[0] || null;
  const sourceNode = getAutoLinkSourceNode();
  if (sourceNode && firstInsertedNode && canNodeConnectTo(sourceNode, firstInsertedNode)) {
    createLink(sourceNode.id, firstInsertedNode.id, getAutoLinkPort(sourceNode) || 'out-right');
  }

  if (firstInsertedNode) selectNode(firstInsertedNode.id);
  renderAll();
  return firstInsertedNode;
}

function addNodeToVisiblePhone(type, kind = '') {
  if (!hasGameNode()) return null;
  const sourceNode = getAutoLinkSourceNode();
  const placement = getAutoPlacementPosition(type, sourceNode);
  return addNode(
    type,
    placement.x,
    placement.y,
    { skipMajorSnap: true, kind }
  );
}

function getConnectTargetFromClientPoint(clientX, clientY) {
  const hit = document.elementFromPoint(clientX, clientY);
  const inPort = hit && hit.closest ? hit.closest('.node-port--in') : null;
  const shell = inPort && inPort.closest ? inPort.closest('.node-shell') : null;
  const node = shell ? getNode(shell.dataset.id) : null;
  return node ? { node, shell, inPort } : null;
}

function updateHoverTarget(clientX, clientY) {
  const target = getConnectTargetFromClientPoint(clientX, clientY);
  const node = target ? target.node : null;
  const sourceNode = state.connectDrag ? getNode(state.connectDrag.fromId) : null;
  state.hoverTargetId = canNodeConnectTo(sourceNode, node) ? node.id : null;
  renderSelectionStates();
}

function createLink(fromId, toId, fromPort = 'out-right') {
  if (!fromId || !toId || fromId === toId) return;
  const fromNode = getNode(fromId);
  const toNode = getNode(toId);
  if (!canNodeConnectTo(fromNode, toNode)) return;
  const normalizedPort = normalizeFromPort(fromNode, fromPort);
  if (hasOutgoingLinkOnPort(fromId, normalizedPort)) return null;
  const exists = state.doc.links.some((link) => link.from === fromId && link.to === toId && normalizeFromPort(fromNode, link.fromPort) === normalizedPort);
  if (exists) return;

  const link = {
    id: 'link-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    from: fromId,
    to: toId,
    fromPort: normalizedPort
  };
  state.doc.links.push(link);
  return link;
}

function stopConnectDrag(clientX, clientY) {
  if (!state.connectDrag) return;
  const target = getConnectTargetFromClientPoint(clientX, clientY);
  const targetId = target ? target.node.id : null;
  if (targetId && targetId !== state.connectDrag.fromId) {
    const link = createLink(state.connectDrag.fromId, targetId, state.connectDrag.fromPort || 'out-right');
    if (link) {
      const sourceNode = getNode(link.from);
      const targetNode = getNode(link.to);
      snapLinkedNodeToSource(targetNode, sourceNode, link.fromPort);
    }
  }
  state.connectDrag = null;
  state.hoverTargetId = null;
  renderAll();
}

function maybeAutoPan(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const threshold = 54;
  const step = 26;
  const scroll = getViewportScrollPosition();

  let nextLeft = scroll.left;
  let nextTop = scroll.top;
  if (clientX < rect.left + threshold) nextLeft -= step;
  if (clientX > rect.right - threshold) nextLeft += step;
  if (clientY < rect.top + threshold) nextTop -= step;
  if (clientY > rect.bottom - threshold) nextTop += step;
  if (nextLeft !== scroll.left || nextTop !== scroll.top) {
    setViewportScrollPosition(nextLeft, nextTop);
  }
}

function seedPhone(options = {}) {
  runWithoutRecoverySync(() => {
    setHeaderOnlyMode(false);
    state.doc = cloneObj(EMPTY_DOC);
    state.currentGameId = null;
    clearSelection();
    state.nextNodeNumbers = createNodeIdCounters();
    const firstSlot = getGameHomeSlot();
    const gameNode = createNode('game', firstSlot.x, firstSlot.y);
    state.doc.nodes.push(gameNode);
    setCurrentGameColors();
    renderGamePickerSelect();
    syncAllTagsFromStore();
    rememberCleanSnapshot();
    renderGameshelf();
    applyZoom();
    renderAll();
    selectNode(gameNode.id);
    renderSelectionStates();
    drawLinks();
    updateSelectionUi();
  });
  if (options.preserveRecovery) {
    setSaveStatus(state.localOnlyChanges ? 'local' : 'idle', 'New Draft Ready');
  } else if (state.localOnlyChanges) {
    syncRecoveryDraftNow({ updateStatus: false });
    setSaveStatus('local', 'Local Changes Only');
  } else {
    clearRecoveryDraft();
    setSaveStatus('idle', 'New Draft Ready');
  }
  void refreshWaypointLibrary({ message: 'Loading saved waypoints...' });
}

function serializeNodeState(node) {
  return {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    title: node.title,
    tagline: node.tagline || '',
    city: node.city || '',
    startingLocation: node.startingLocation || '',
    howToPlay: node.howToPlay || '',
    guideName: node.guideName || '',
    guideBio: node.guideBio || '',
    guideImageUrl: node.guideImageUrl || '',
    logoUrl: node.logoUrl || '',
    price: node.price || '',
    builderNotes: node.builderNotes || '',
    tags: (node.tags || []).filter(Boolean),
    ...getTeamFieldState(node),
    waypointGroup: node.type === 'stop' ? normalizeWaypointGroup(node.waypointGroup) : '',
    body: node.body,
    buttonUrl: node.buttonUrl || '',
    tertiaryColor: node.tertiaryColor || '',
    quaternaryColor: node.quaternaryColor || '',
    varName: node.varName || '',
    acceptAny: !!node.acceptAny,
    anytime: !!node.anytime,
    anytimePairId: node.anytimePairId || '',
    kind: node.kind || '',
    rotation: getNodeRotation(node),
    orderIndex: normalizeNodeOrderIndex(node.orderIndex)
  };
}

function serializeLinkState(link) {
  return {
    id: link.id,
    from: link.from,
    to: link.to,
    fromPort: normalizeFromPort(getNode(link.from) || parseTypedNodeId(link.from)?.type, link.fromPort)
  };
}

function serializeDocState(doc = state.doc, options = {}) {
  const touchUpdatedAt = !!options.touchUpdatedAt;
  return {
    updatedAt: touchUpdatedAt
      ? new Date().toISOString()
      : (typeof (doc && doc.updatedAt) === 'string' ? doc.updatedAt : ''),
    nodes: (doc && Array.isArray(doc.nodes) ? doc.nodes : []).map(serializeNodeState),
    links: (doc && Array.isArray(doc.links) ? doc.links : []).map(serializeLinkState)
  };
}

function serializeDoc() {
  return serializeDocState(state.doc, { touchUpdatedAt: true });
}

function setSaveStatus(kind, text) {
  state.saveUiState = kind || 'idle';
  updateActionUi();
  updateSelectionUi({ skipRecoverySync: true });
}

function readLocalStoreSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || 'null');
    return raw && typeof raw === 'object' ? normalizeStore(raw) : null;
  } catch (error) {
    return null;
  }
}

function getStoreUpdatedTime(store) {
  if (!store || typeof store !== 'object') return 0;
  const candidates = [store.updatedAt];
  if (Array.isArray(store.games)) {
    store.games.forEach((game) => {
      candidates.push(game && game.updatedAt);
      candidates.push(game && game.createdAt);
    });
  }
  return candidates.reduce((latest, value) => {
    if (typeof value !== 'string' || !value) return latest;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
}

function pickPreferredStoreCandidate(candidates = []) {
  let best = null;
  let bestTime = -1;
  candidates.forEach((candidate) => {
    if (!candidate) return;
    const candidateTime = getStoreUpdatedTime(candidate);
    if (!best || candidateTime > bestTime) {
      best = candidate;
      bestTime = candidateTime;
    }
  });
  return best;
}

function shouldKeepRecoveryDraft() {
  return hasPendingSaveChanges();
}

function buildRecoverySnapshot() {
  return JSON.stringify({
    currentGameId: state.currentGameId || '',
    currentGameColors: getCurrentGameColors(),
    cleanSnapshot: state.cleanSnapshot || '',
    localOnlyChanges: !!state.localOnlyChanges,
    doc: serializeDocState(state.doc),
    store: state.store
  });
}

function clearRecoveryDraft() {
  if (recoverySaveTimer) {
    window.clearTimeout(recoverySaveTimer);
    recoverySaveTimer = 0;
  }
  state.lastRecoverySnapshot = '';
  try {
    localStorage.removeItem(LOCAL_RECOVERY_KEY);
  } catch (error) {
  }
}

function syncRecoveryDraftNow(options = {}) {
  if (state.suspendRecoverySync) return false;
  if (recoverySaveTimer) {
    window.clearTimeout(recoverySaveTimer);
    recoverySaveTimer = 0;
  }
  if (!shouldKeepRecoveryDraft()) {
    clearRecoveryDraft();
    return false;
  }

  const snapshot = buildRecoverySnapshot();
  if (snapshot === state.lastRecoverySnapshot) return false;

  try {
    const payload = JSON.parse(snapshot);
    payload.version = RECOVERY_VERSION;
    payload.storedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_RECOVERY_KEY, JSON.stringify(payload));
    state.lastRecoverySnapshot = snapshot;
    if (options.updateStatus !== false) setSaveStatus(state.localOnlyChanges ? 'local' : 'unsaved');
    return true;
  } catch (error) {
    if (options.updateStatus !== false) setSaveStatus('error');
    return false;
  }
}

function scheduleRecoverySync(options = {}) {
  if (state.suspendRecoverySync) return;

  if (!shouldKeepRecoveryDraft()) {
    clearRecoveryDraft();
    return;
  }

  if (options.markDirty !== false && hasPendingSaveChanges()) {
    setSaveStatus('unsaved');
  }

  if (options.immediate) {
    syncRecoveryDraftNow(options);
    return;
  }

  if (recoverySaveTimer) window.clearTimeout(recoverySaveTimer);
  recoverySaveTimer = window.setTimeout(() => {
    recoverySaveTimer = 0;
    syncRecoveryDraftNow(options);
  }, RECOVERY_SAVE_DELAY_MS);
}

function readRecoveryDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const doc = normalizeDoc(raw.doc);
    const store = normalizeStore(raw.store);
    return {
      version: raw.version,
      storedAt: typeof raw.storedAt === 'string' ? raw.storedAt : '',
      currentGameId: typeof raw.currentGameId === 'string' && raw.currentGameId.trim()
        ? raw.currentGameId.trim()
        : null,
      currentGameColors: raw.currentGameColors && typeof raw.currentGameColors === 'object'
        ? raw.currentGameColors
        : null,
      cleanSnapshot: typeof raw.cleanSnapshot === 'string' ? raw.cleanSnapshot : '',
      localOnlyChanges: !!raw.localOnlyChanges,
      doc,
      store
    };
  } catch (error) {
    return null;
  }
}

function runWithoutRecoverySync(work) {
  const previous = state.suspendRecoverySync;
  state.suspendRecoverySync = true;
  try {
    return work();
  } finally {
    state.suspendRecoverySync = previous;
  }
}

function showGameshelfHome() {
  runWithoutRecoverySync(() => {
    setHeaderOnlyMode(false);
    state.doc = cloneObj(EMPTY_DOC);
    state.currentGameId = null;
    state.currentGameColors = null;
    clearSelection();
    state.nextNodeNumbers = createNodeIdCounters();
    syncAllTagsFromStore();
    rememberCleanSnapshot();
    renderGameshelf();
    applyZoom();
    renderAll();
    resetHomeScrollPositions();
    scheduleInitialScrollReset();
    drawLinks();
    updateSelectionUi();
  });
  if (state.localOnlyChanges) {
    syncRecoveryDraftNow({ updateStatus: false });
    setSaveStatus('local', 'Local Changes Only');
  } else {
    clearRecoveryDraft();
    setSaveStatus('idle', 'No Game Open');
  }
  void refreshWaypointLibrary({ message: 'Loading saved waypoints...' });
}

function restoreRecoveryWorkspace(recovery) {
  if (!recovery) return false;
  runWithoutRecoverySync(() => {
    setHeaderOnlyMode(false);
    state.store = recovery.store;
    state.headerGames = buildHeaderGameList(recovery.store && recovery.store.games ? recovery.store.games : []);
    state.doc = recovery.doc;
    state.currentGameId = recovery.currentGameId;
    state.localOnlyChanges = !!recovery.localOnlyChanges;
    clearSelection();
    syncAllTagsFromStore();
    syncNextNodeNumbers();
    setCurrentGameColors(recovery.currentGameColors);
    state.cleanSnapshot = recovery.cleanSnapshot || getDocSnapshot(recovery.doc);
    renderGamePickerSelect();
    renderGameshelf();
    applyZoom();
    renderAll();
    const gameNode = getGameNode();
    if (gameNode) selectNode(gameNode.id);
    renderSelectionStates();
    scheduleInitialScrollReset();
    drawLinks();
    updateSelectionUi();
  });
  state.lastRecoverySnapshot = buildRecoverySnapshot();
  setSaveStatus('draft', 'Recovered Local Draft');
  void refreshWaypointLibrary({ message: 'Loading saved waypoints...' });
  return true;
}

function ensureAllReplyVarNames() {
  let changed = false;
  state.doc.nodes.forEach((node) => {
    if (!node || node.type !== 'reply') return;
    const before = normalizeVariableName(node.varName);
    ensureReplyVarName(node);
    if (normalizeVariableName(node.varName) !== before) changed = true;
  });
  return changed;
}

function persistStoreLocally() {
  try {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state.store));
    if (state.currentGameId) localStorage.setItem(LOCAL_OPEN_GAME_KEY, state.currentGameId);
    else localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
  } catch (error) {
  }
}

function rememberPlayPreview(savedGame) {
  if (!savedGame) return;
  try {
    sessionStorage.setItem(PLAY_PREVIEW_KEY, JSON.stringify({
      game: savedGame,
      storedAt: new Date().toISOString()
    }));
  } catch (error) {
  }
}

function shouldStageCurrentGameForSave() {
  if (!hasGameNode()) return false;
  if (!state.currentGameId) return true;
  if (hasUnsavedChanges()) return true;
  return !state.store.games.some((game) => game.id === state.currentGameId);
}

function stageCurrentGameIntoStore() {
  if (!shouldStageCurrentGameForSave()) return null;

  syncSelectedGameGuideImageFromInput();

  const docPayload = serializeDoc();
  const existingGame = state.store.games.find((game) => game.id === state.currentGameId);
  const existingIndex = state.store.games.findIndex((game) => game.id === state.currentGameId);
  const savedGameId = state.currentGameId || makeGameId();
  const savedGameName = getDocName(docPayload);
  const fallbackColors = getSavedGameColors(
    existingGame || { id: savedGameId, name: savedGameName },
    existingIndex >= 0 ? existingIndex : state.store.games.length
  );
  const colors = {
    primaryColor: normalizeSavedGameColor(state.currentGameColors && state.currentGameColors.primaryColor, fallbackColors.primaryColor),
    secondaryColor: normalizeSavedGameColor(state.currentGameColors && state.currentGameColors.secondaryColor, fallbackColors.secondaryColor)
  };
  const savedGame = {
    id: savedGameId,
    name: savedGameName,
    city: (() => {
      const gameNode = docPayload.nodes.find((node) => node && node.type === 'game');
      return gameNode && typeof gameNode.city === 'string' ? gameNode.city : (existingGame && existingGame.city ? existingGame.city : '');
    })(),
    createdAt: existingGame && existingGame.createdAt ? existingGame.createdAt : docPayload.updatedAt,
    updatedAt: docPayload.updatedAt,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    featured: existingGame && existingGame.featured ? existingGame.featured : '',
    archived: existingGame && existingGame.archived ? existingGame.archived : '',
    erased: existingGame && existingGame.erased ? existingGame.erased : '',
    nodes: docPayload.nodes,
    links: docPayload.links
  };

  state.currentGameId = savedGame.id;
  setCurrentGameColors(colors);
  state.doc.updatedAt = docPayload.updatedAt;
  state.store.updatedAt = docPayload.updatedAt;
  if (existingIndex >= 0) state.store.games[existingIndex] = savedGame;
  else state.store.games.push(savedGame);

  upsertHeaderGame(savedGame);
  syncAllTagsFromStore();
  renderGameshelf();
  persistStoreLocally();
  return savedGame;
}

async function saveDoc(options = {}) {
  const silent = !!options.silent;
  const needsCurrentGameStage = shouldStageCurrentGameForSave();
  const hasPendingChanges = hasPendingSaveChanges() || needsCurrentGameStage;

  if (!hasPendingChanges) {
    if (!silent) setSaveStatus('idle');
    return { savedGame: null, serverSaved: false, localOnly: false, skipped: true };
  }

  if (hasGameNode()) {
    const validationIssue = validateReplyNodes({ showAlert: true });
    if (validationIssue) {
      return {
        savedGame: null,
        serverSaved: false,
        localOnly: false,
        skipped: true,
        validationFailed: true,
        error: new Error(validationIssue.message)
      };
    }
  }

  setSaveStatus('saving');
  if (!state.currentGameId && hasGameNode()) {
    state.currentGameId = await makeUniqueGameId();
  }
  const savedGame = stageCurrentGameIntoStore();
  if (!savedGame && !state.store.updatedAt) {
    state.store.updatedAt = new Date().toISOString();
  }
  persistStoreLocally();
  updateActionUi();
  syncRecoveryDraftNow({ updateStatus: false });

  try {
    const syncResult = await syncStoreToSupabase();
    if (!syncResult || syncResult.localOnly) {
      state.localOnlyChanges = true;
      syncRecoveryDraftNow({ updateStatus: false });
      setSaveStatus(syncResult && syncResult.cancelled ? 'unsaved' : 'local');
      void refreshWaypointLibrary({ skipRemote: true, message: 'Refreshing saved waypoints...' });
      return { savedGame, serverSaved: false, localOnly: true, error: syncResult && syncResult.error ? syncResult.error : null, cancelled: !!(syncResult && syncResult.cancelled) };
    }

    state.localOnlyChanges = false;
    const persistedGame = syncResult.savedGame || savedGame;
    if (persistedGame && persistedGame.id) {
      clearEditorLaunchIntent();
    }
    if (savedGame) rememberCleanSnapshot();
    renderGameshelf();
    clearRecoveryDraft();
    setSaveStatus('saved');
    updateActionUi();
    void refreshWaypointLibrary({ message: 'Refreshing saved waypoints...' });
    return {
      savedGame: persistedGame,
      serverSaved: !!syncResult.serverSaved,
      localOnly: false,
      storageKind: syncResult.storageKind || SUPABASE_STORAGE_KIND
    };
  } catch (error) {
    state.localOnlyChanges = true;
    syncRecoveryDraftNow({ updateStatus: false });
    setSaveStatus('local');
    void refreshWaypointLibrary({ skipRemote: true, message: 'Refreshing saved waypoints...' });
    return { savedGame, serverSaved: false, localOnly: true, error };
  }
}

async function playCurrentGame() {
  if (!canPlayCurrentGame()) return;
  const selectedGamePickerId = getSelectedGamePickerId();
  if (!hasGameNode()) {
    if (!selectedGamePickerId) return;
    const previewGame = state.headerGames.find((game) => game && game.id === selectedGamePickerId)
      || state.store.games.find((game) => game && game.id === selectedGamePickerId)
      || null;
    rememberPlayPreview(previewGame);
    const target = new URL('../game', location.href);
    target.searchParams.set('id', selectedGamePickerId);
    window.open(target.toString(), '_blank');
    return;
  }
  const requiresProtectiveSave = canSaveCurrentGame();
  const result = await saveDoc({ silent: true });
  if (requiresProtectiveSave && (!result || result.localOnly || result.error)) {
    return;
  }
  const savedGame = result && result.savedGame ? result.savedGame : null;
  const gameId = savedGame && savedGame.id ? savedGame.id : state.currentGameId;
  if (!gameId) return;
  rememberPlayPreview(savedGame);
  const target = new URL('../game', location.href);
  target.searchParams.set('id', gameId);
  window.open(target.toString(), '_blank');
}

async function loadDoc() {
  setSaveStatus('loading', 'Loading Game');
  state.store = cloneObj(EMPTY_STORE);

  const launchIntent = getEditorLaunchIntent();
  const recovery = readRecoveryDraft();
  if (launchIntent.gameId && recovery && recovery.currentGameId === launchIntent.gameId) {
    if (restoreRecoveryWorkspace(recovery)) {
      return;
    }
  }

  if (launchIntent.wantsNew) {
    clearRecoveryDraft();
    clearEditorLaunchIntent();
    seedPhone();
    return;
  }

  if (!launchIntent.explicit) {
    if (isBuilderTutorialMode()) {
      seedPhone({ preserveRecovery: true });
      return;
    }
    // Temporary default: load by ID
    const defaultGame = await loadGameFromSupabase('dealertire');
    if (defaultGame) {
      clearRecoveryDraft();
      state.store = buildStoreFromGames([defaultGame]);
      openSavedGame(defaultGame.id, { updateUrl: false });
      return;
    }
    showGameshelfHome();
    setHeaderOnlyMode(true);
    return;
  }

  if (launchIntent.gameId) {
    const remoteGame = await loadGameFromSupabase(launchIntent.gameId);
    if (remoteGame) {
      state.store = buildStoreFromGames([remoteGame]);
      openSavedGame(remoteGame.id, { updateUrl: false });
      return;
    }
  }

  if (recovery) {
    if (restoreRecoveryWorkspace(recovery)) {
      return;
    }
  }

  if (launchIntent.gameId) {
    clearEditorLaunchIntent();
    showGameshelfHome();
    return;
  }

  showGameshelfHome();
  setHeaderOnlyMode(true);
}

renderStencilPreviews();

if (phoneThreadMeta) {
  phoneThreadMeta.addEventListener('click', () => {
    openGameDetailsFromPhoneHeader();
  });

  phoneThreadMeta.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openGameDetailsFromPhoneHeader();
  });
}

stencilBar.querySelectorAll('[data-stencil]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    clearStencilPress();
    startStencilPress(button.dataset.stencil, event);
  });

  button.addEventListener('dblclick', (event) => {
    event.preventDefault();
    clearStencilPress();
    cancelStencilDrag();
    addNodeToVisiblePhone(button.dataset.stencil);
  });
});

if (addPanel) {
  addPanel.querySelectorAll('[data-add-stencil]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      clearStencilPress();
      startStencilPress(button.dataset.addStencil, event, button.dataset.addKind || '');
    });

    button.addEventListener('pointerup', (event) => {
      if (event.button !== 0) return;
      if (state.stencilPress) addNodeToVisiblePhone(button.dataset.addStencil, button.dataset.addKind || '');
    });
  });
}
if (waypointLibraryList) {
  waypointLibraryList.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-waypoint-library-id]');
    if (!button || event.button !== 0) return;
    closeNodeContextMenu();
    state.waypointLibraryPress = {
      entryId: button.dataset.waypointLibraryId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY
    };
  });

  waypointLibraryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-waypoint-library-id]');
    if (!button) return;
    if (state.waypointLibrarySuppressClick) {
      state.waypointLibrarySuppressClick = false;
      return;
    }
    insertWaypointLibraryEntry(button.dataset.waypointLibraryId);
  });

  waypointLibraryList.addEventListener('contextmenu', (event) => {
    const button = event.target.closest('[data-waypoint-library-id]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openWaypointLibraryContextMenu(button.dataset.waypointLibraryId, event.clientX, event.clientY);
  });
}

nodeTitleInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.title = nodeTitleInput.value || TYPE_CONFIG[node.type].title;
  renderGamePickerSelect();
  renderAll();
});

objectStopNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'stop') return;
  objectStopNameInput.value = normalizeWaypointTitle(objectStopNameInput.value, TYPE_CONFIG.stop.title);
  node.title = objectStopNameInput.value || TYPE_CONFIG.stop.title;
  renderAll();
});

stopNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'stop') return;
  stopNameInput.value = normalizeWaypointTitle(stopNameInput.value, TYPE_CONFIG.stop.title);
  node.title = stopNameInput.value || TYPE_CONFIG.stop.title;
  renderAll();
});


objectVarNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'reply') return;
  node.varName = normalizeVariableName(objectVarNameInput.value);
  refreshVarNameHint();
  renderAll();
});

objectWaypointGroupButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'stop') return;
    const buttonGroup = normalizeWaypointGroup(button && button.dataset ? button.dataset.waypointGroupBtn : '');
    const currentGroup = normalizeWaypointGroup(node.waypointGroup);
    node.waypointGroup = currentGroup === buttonGroup ? '' : buttonGroup;
    syncWaypointGroupButtons(node.waypointGroup, false);
    renderAll();
  });
});

if (objectButtonTargetInput) {
  objectButtonTargetInput.addEventListener('input', () => {
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'button') return;
    node.buttonUrl = objectButtonTargetInput.value;
    scheduleRecoverySync();
  });
}

if (objectButtonNameInput) {
  objectButtonNameInput.addEventListener('input', () => {
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'button') return;
    node.title = objectButtonNameInput.value || TYPE_CONFIG[node.type].title;
    renderAll();
  });
}

varNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'reply') return;
  node.varName = normalizeVariableName(varNameInput.value);
  refreshVarNameHint();
  renderAll();
});

const savedAnswerBodies = new Map();

function setReplyAcceptAny(replyNode, enabled) {
  if (!replyNode || replyNode.type !== 'reply') return false;
  const shouldEnable = !!enabled;
  if (!!replyNode.acceptAny === shouldEnable) return true;

  replyNode.acceptAny = shouldEnable;
  if (shouldEnable) {
    savedAnswerBodies.set(replyNode.id, replyNode.body || '');
    replyNode.body = '';
  } else {
    replyNode.body = savedAnswerBodies.get(replyNode.id) || '';
  }

  return true;
}

function setReplyMode(replyNode, mode) {
  if (!replyNode || replyNode.type !== 'reply') return false;
  const nextMode = String(mode || '').trim().toLowerCase();
  const previous = {
    acceptAny: !!replyNode.acceptAny,
    anytime: !!replyNode.anytime,
    anytimePairId: replyNode.anytimePairId || '',
    body: replyNode.body || '',
    hadSavedAnswer: savedAnswerBodies.has(replyNode.id),
    savedAnswer: savedAnswerBodies.get(replyNode.id) || '',
    selectedId: state.selectedId,
    selectedLinkId: state.selectedLinkId
  };

  let changed = false;
  if (nextMode === 'anyanswer') {
    disableAnytimeForReply(replyNode);
    changed = !!previous.anytime || !!previous.anytimePairId || setReplyAcceptAny(replyNode, true);
  } else {
    changed = setReplyAcceptAny(replyNode, false);
  }

  if (!changed) {
    replyNode.acceptAny = previous.acceptAny;
    replyNode.anytime = previous.anytime;
    replyNode.anytimePairId = previous.anytimePairId;
    replyNode.body = previous.body;
    if (previous.hadSavedAnswer) savedAnswerBodies.set(replyNode.id, previous.savedAnswer);
    else savedAnswerBodies.delete(replyNode.id);
    state.selectedId = previous.selectedId;
    state.selectedLinkId = previous.selectedLinkId;
    syncReplyModeInputs(replyNode);
    return false;
  }

  return true;
}

function setReplyTiming(replyNode, timing) {
  if (!replyNode || replyNode.type !== 'reply') return false;
  const nextTiming = String(timing || '').trim().toLowerCase();
  const previousTiming = getReplyTiming(replyNode);
  if (nextTiming !== 'anytime' && nextTiming !== 'inline') return false;
  if (previousTiming === nextTiming && !(nextTiming === 'anytime' && getRawAnytimePairId(replyNode))) return true;

  if (nextTiming === 'anytime') {
    if (!canEnableInlineAnytimeForReply(replyNode, { showAlert: true })) return false;
    if (replyNode.acceptAny) setReplyAcceptAny(replyNode, false);
    disableAnytimeForReply(replyNode);
    replyNode.anytime = true;
    replyNode.anytimePairId = '';
    return true;
  }

  disableAnytimeForReply(replyNode);
  return true;
}

[replyModeNormalInput, replyModeAnyAnswerInput, replyModeAnytimeInput].forEach((input) => {
  if (!input) return;
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'reply') return;
    if (!setReplyMode(node, input.value)) return;
    renderAll();
  });
});

[
  objectReplyModeNormalInput,
  objectReplyModeAnyAnswerInput,
  objectReplyModeAnytimeInput
].forEach((input) => {
  if (!input) return;
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'reply') return;
    if (!setReplyMode(node, input.value)) return;
    renderAll();
  });
});

[
  objectReplyTimingInlineInput,
  objectReplyTimingAnytimeInput
].forEach((input) => {
  if (!input) return;
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'reply') return;
    if (!setReplyTiming(node, input.value)) return;
    renderAll();
  });
});

varValueInputs.forEach((input, i) => {
  input.addEventListener('input', () => {
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'ask') return;
    node.varValues = normalizeVarValues(node.varValues);
    node.varValues[i] = input.value;
    renderAll();
  });
});

varCorrectRadios.forEach((radio, i) => {
  radio.addEventListener('click', () => {
    const node = getNode(state.selectedId);
    if (!node || node.type !== 'ask') return;
    if (node.varCorrect === i) {
      node.varCorrect = null;
      radio.checked = false;
    } else {
      node.varCorrect = i;
    }
    renderAll();
  });
});


nodeTaglineInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.tagline = nodeTaglineInput.value;
  updateSelectionUi();
});


if (nodeCityInput) {
  nodeCityInput.addEventListener('input', () => {
    const node = getGameNode();
    if (!node || node.type !== 'game') return;
    node.city = nodeCityInput.value;
    updateSelectionUi();
  });
}

nodeStartingLocationInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.startingLocation = nodeStartingLocationInput.value;
  updateSelectionUi();
});

nodeStartingLocationMapBtn.addEventListener('click', () => {
  const url = nodeStartingLocationInput.value.trim() || 'https://w3w.co/wizard.brother.sediment';
  window.open(url, '_blank', 'noopener');
});

nodeHowToPlayInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.howToPlay = nodeHowToPlayInput.value;
  updateSelectionUi();
});

nodeGuideNameInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.guideName = nodeGuideNameInput.value;
  updateSelectionUi();
  updatePhoneChrome();
});

nodeGuideBioInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.guideBio = nodeGuideBioInput.value;
  updateSelectionUi();
});

nodeGameLogoInput.addEventListener('input', () => {
  setGameLogoAssetStatus('');
  syncSelectedGameLogoFromInput();
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  updateSelectionUi();
});

nodeGameLogoInput.addEventListener('change', () => {
  setGameLogoAssetStatus('');
  syncSelectedGameLogoFromInput();
  updateSelectionUi();
});

if (gameLogoOnlinePickBtn && gameLogoOnlineList) {
  gameLogoOnlinePickBtn.addEventListener('click', async () => {
    if (gameLogoOnlinePickBtn.disabled) return;
    await openGameLogoOnlinePicker(false);
  });

  gameLogoOnlineList.addEventListener('click', async (event) => {
    const assetItem = event.target instanceof Element
      ? event.target.closest('.guide-image-asset-item')
      : null;
    const nextUrl = assetItem ? String(assetItem.getAttribute('data-asset-url') || '').trim() : '';
    if (!nextUrl) return;
    const applied = await applyPublishedGameLogoUrl(nextUrl);
    if (applied) setGameLogoOnlineMenuOpen(false);
  });
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (gameLogoOnlineMenu && !gameLogoOnlineMenu.hidden && gameLogoField && !gameLogoField.contains(target)) {
    setGameLogoOnlineMenuOpen(false);
  }
  if (guideImageOnlineMenu && !guideImageOnlineMenu.hidden && guideImageField && !guideImageField.contains(target)) {
    setGuideImageOnlineMenuOpen(false);
  }
  if (objectBubbleImageOnlineMenu && !objectBubbleImageOnlineMenu.hidden && objectBubbleImageField && !objectBubbleImageField.contains(target)) {
    setBubbleImageOnlineMenuOpen(false);
  }
});

if (objectBubbleImageInput) {
  objectBubbleImageInput.addEventListener('input', () => {
    setBubbleImageAssetStatus('');
    syncSelectedBubbleImageFromInput();
    const node = getNode(state.selectedId);
    updateBubbleImagePreview(node);
    renderAll();
  });
  objectBubbleImageInput.addEventListener('change', () => {
    setBubbleImageAssetStatus('');
    syncSelectedBubbleImageFromInput();
    const node = getNode(state.selectedId);
    updateBubbleImagePreview(node);
    renderAll();
  });
}

if (objectBubbleVideoInput) {
  const syncVideo = () => {
    const node = getNode(state.selectedId);
    if (!node || node.kind !== 'video') return;
    node.body = String(objectBubbleVideoInput.value || '');
    node._naturalImageWidth = null;
    node._naturalImageHeight = null;
    node.height = 38;
    renderAll();
  };
  objectBubbleVideoInput.addEventListener('input', syncVideo);
  objectBubbleVideoInput.addEventListener('change', syncVideo);
}


if (objectBubbleImageOnlinePickBtn && objectBubbleImageOnlineList) {
  objectBubbleImageOnlinePickBtn.addEventListener('click', async () => {
    if (objectBubbleImageOnlinePickBtn.disabled) return;
    await openBubbleImageOnlinePicker(false);
  });
  objectBubbleImageOnlineList.addEventListener('click', async (event) => {
    const assetItem = event.target instanceof Element ? event.target.closest('.guide-image-asset-item') : null;
    const nextUrl = assetItem ? String(assetItem.getAttribute('data-asset-url') || '').trim() : '';
    if (!nextUrl) return;
    const applied = await applyPublishedBubbleImageUrl(nextUrl);
    if (applied) setBubbleImageOnlineMenuOpen(false);
  });
}

if (objectBubbleImageThumbImage) {
  objectBubbleImageThumbImage.addEventListener('error', () => {
    if (objectBubbleImageThumbBtn) {
      objectBubbleImageThumbBtn.disabled = true;
      objectBubbleImageThumbBtn.classList.add('is-broken');
    }
    objectBubbleImageThumbImage.hidden = true;
    if (objectBubbleImageThumbPlaceholder) {
      objectBubbleImageThumbPlaceholder.hidden = false;
      objectBubbleImageThumbPlaceholder.textContent = 'Bad image';
    }
  });
  objectBubbleImageThumbImage.addEventListener('load', () => {
    const node = getNode(state.selectedId);
    if (objectBubbleImageThumbBtn) {
      objectBubbleImageThumbBtn.disabled = !getCurrentBubbleImageUrl(node);
      objectBubbleImageThumbBtn.classList.remove('is-broken');
    }
    objectBubbleImageThumbImage.hidden = false;
    if (objectBubbleImageThumbPlaceholder) objectBubbleImageThumbPlaceholder.hidden = true;
  });
}

if (objectBubbleImageThumbBtn) {
  objectBubbleImageThumbBtn.addEventListener('click', () => {
    const node = getNode(state.selectedId);
    const url = getCurrentBubbleImageUrl(node);
    if (!url || !guideImageLightboxBackdrop || !guideImageLightboxImage) return;
    state.guideImageLightboxPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    guideImageLightboxImage.src = url;
    guideImageLightboxBackdrop.hidden = false;
    document.body.classList.add('guide-image-lightbox-open');
    if (guideImageLightboxCloseBtn) {
      try { guideImageLightboxCloseBtn.focus({ preventScroll: true }); } catch (e) { guideImageLightboxCloseBtn.focus(); }
    }
  });
}

nodeGuideImageInput.addEventListener('input', () => {
  setGuideImageAssetStatus('');
  syncSelectedGameGuideImageFromInput();
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  updateSelectionUi();
  updatePhoneChrome();
});

nodeGuideImageInput.addEventListener('change', () => {
  setGuideImageAssetStatus('');
  syncSelectedGameGuideImageFromInput();
  updateSelectionUi();
  updatePhoneChrome();
});

if (guideImageOnlinePickBtn && guideImageOnlineList) {
  guideImageOnlinePickBtn.addEventListener('click', async () => {
    if (guideImageOnlinePickBtn.disabled) return;
    await openGuideImageOnlinePicker(false);
  });

  guideImageOnlineList.addEventListener('click', async (event) => {
    const assetItem = event.target instanceof Element
      ? event.target.closest('.guide-image-asset-item')
      : null;
    const nextUrl = assetItem ? String(assetItem.getAttribute('data-asset-url') || '').trim() : '';
    if (!nextUrl) return;
    const applied = await applyPublishedGuideImageUrl(nextUrl);
    if (applied) setGuideImageOnlineMenuOpen(false);
  });
}

if (gameLogoThumbImage) {
  gameLogoThumbImage.addEventListener('error', () => {
    if (gameLogoThumbBtn) {
      gameLogoThumbBtn.disabled = true;
      gameLogoThumbBtn.classList.add('is-broken');
    }
    if (gameLogoThumbImage) gameLogoThumbImage.hidden = true;
    if (gameLogoThumbPlaceholder) {
      gameLogoThumbPlaceholder.hidden = false;
      gameLogoThumbPlaceholder.textContent = 'Bad image';
    }
  });

  gameLogoThumbImage.addEventListener('load', () => {
    if (gameLogoThumbBtn) {
      gameLogoThumbBtn.disabled = !getCurrentGameLogoUrl();
      gameLogoThumbBtn.classList.remove('is-broken');
    }
    if (gameLogoThumbImage) gameLogoThumbImage.hidden = false;
    if (gameLogoThumbPlaceholder) gameLogoThumbPlaceholder.hidden = true;
  });
}

if (gameLogoThumbBtn) {
  gameLogoThumbBtn.addEventListener('click', () => {
    openGameLogoLightbox();
  });
}

if (guideImageThumbImage) {
  guideImageThumbImage.addEventListener('error', () => {
    if (guideImageThumbBtn) {
      guideImageThumbBtn.disabled = true;
      guideImageThumbBtn.classList.add('is-broken');
    }
    if (guideImageThumbImage) guideImageThumbImage.hidden = true;
    if (guideImageThumbPlaceholder) {
      guideImageThumbPlaceholder.hidden = false;
      guideImageThumbPlaceholder.textContent = 'Bad image';
    }
    closeGuideImageLightbox();
  });

  guideImageThumbImage.addEventListener('load', () => {
    if (guideImageThumbBtn) {
      guideImageThumbBtn.disabled = !getCurrentGuideImageUrl();
      guideImageThumbBtn.classList.remove('is-broken');
    }
    if (guideImageThumbImage) guideImageThumbImage.hidden = false;
    if (guideImageThumbPlaceholder) guideImageThumbPlaceholder.hidden = true;
  });
}

if (guideImageThumbBtn) {
  guideImageThumbBtn.addEventListener('click', () => {
    openGuideImageLightbox();
  });
}

if (guideImageLightboxBackdrop) {
  guideImageLightboxBackdrop.addEventListener('click', (event) => {
    if (event.target === guideImageLightboxBackdrop) closeGuideImageLightbox();
  });
}

if (guideImageLightboxCloseBtn) {
  guideImageLightboxCloseBtn.addEventListener('click', () => {
    closeGuideImageLightbox();
  });
}

nodePriceInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.price = nodePriceInput.value;
  updateSelectionUi();
});

teamInputs.forEach((inp, i) => {
  if (!inp) return;
  inp.addEventListener('input', () => {
    const node = getGameNode();
    if (!node || node.type !== 'game') return;
    setTeamFieldValue(node, i, inp.value);
    scheduleRecoverySync();
    updateActionUi();
  });
});

function syncGameColorInputs() {
  const colors = getCurrentGameColors();
  if (primaryColorInput) {
    primaryColorInput.value = colors.primaryColor;
    primaryColorInput.classList.remove('is-invalid');
  }
  if (primaryColorPickerInput) {
    primaryColorPickerInput.value = colorValueToHex(colors.primaryColor, '#5468a7');
  }
  if (secondaryColorInput) {
    secondaryColorInput.value = colors.secondaryColor;
    secondaryColorInput.classList.remove('is-invalid');
  }
  if (secondaryColorPickerInput) {
    secondaryColorPickerInput.value = colorValueToHex(colors.secondaryColor, '#243256');
  }
}

function commitCurrentGameColor(key, rawValue) {
  if (!setCurrentGameColorValue(key, rawValue)) return false;
  renderGameshelf();
  updateActionUi();
  return true;
}

function bindGameColorInputs(textInput, pickerInput, key) {
  if (!textInput || !pickerInput) return;

  pickerInput.addEventListener('input', () => {
    commitCurrentGameColor(key, pickerInput.value);
    syncGameColorInputs();
  });

  textInput.addEventListener('input', () => {
    const supportedValue = getSupportedColorValue(textInput.value);
    const hasValue = !!textInput.value.trim();
    textInput.classList.toggle('is-invalid', hasValue && !supportedValue);
    if (!supportedValue) return;
    commitCurrentGameColor(key, supportedValue);
    syncGameColorInputs();
  });

  textInput.addEventListener('blur', () => {
    syncGameColorInputs();
  });
}

bindGameColorInputs(primaryColorInput, primaryColorPickerInput, 'primaryColor');
bindGameColorInputs(secondaryColorInput, secondaryColorPickerInput, 'secondaryColor');

function normalizeTertiaryColorValue(rawValue, fallback = '') {
  const supportedValue = getSupportedColorValue(rawValue);
  if (supportedValue) return colorValueToHex(supportedValue, '#ffffff');
  const supportedFallback = getSupportedColorValue(fallback);
  if (supportedFallback) return colorValueToHex(supportedFallback, '#ffffff');
  return '';
}

function normalizeQuaternaryColorValue(rawValue, fallback = '') {
  const supportedValue = getSupportedColorValue(rawValue);
  if (supportedValue) return colorValueToHex(supportedValue, '#243256');
  const supportedFallback = getSupportedColorValue(fallback);
  if (supportedFallback) return colorValueToHex(supportedFallback, '#243256');
  return '';
}

function getQuaternaryColorFallback(primaryColor = '', secondaryColor = '') {
  return normalizeQuaternaryColorValue(secondaryColor, primaryColor || '#243256') || '#243256';
}

function colorsMatch(a, b) {
  if (!a || !b) return false;
  return colorValueToHex(a, '#000000').toLowerCase() === colorValueToHex(b, '#000000').toLowerCase();
}

function syncCurrentTertiaryInputs() {
  const node = getGameNode();
  const tertiaryValue = (node && node.tertiaryColor) || '';
  if (tertiaryColorInput) {
    tertiaryColorInput.value = tertiaryValue;
    tertiaryColorInput.classList.remove('is-invalid');
  }
  if (tertiaryColorPickerInput) {
    tertiaryColorPickerInput.value = colorValueToHex(tertiaryValue, '#ffffff');
  }
}

function commitCurrentTertiaryColor(rawValue) {
  const node = getGameNode();
  if (!node) return false;
  const nextValue = normalizeTertiaryColorValue(rawValue, node.tertiaryColor || '#ffffff');
  if (!nextValue) return false;
  if (colorsMatch(node.tertiaryColor, nextValue)) return false;
  node.tertiaryColor = nextValue;
  return true;
}

function syncCurrentQuaternaryInputs() {
  const node = getGameNode();
  const currentColors = getCurrentGameColors();
  const fallback = getQuaternaryColorFallback(currentColors.primaryColor, currentColors.secondaryColor);
  const quaternaryValue = normalizeQuaternaryColorValue(node && node.quaternaryColor, fallback);
  if (quaternaryColorInput) {
    quaternaryColorInput.value = quaternaryValue;
    quaternaryColorInput.classList.remove('is-invalid');
  }
  if (quaternaryColorPickerInput) {
    quaternaryColorPickerInput.value = colorValueToHex(quaternaryValue, fallback);
  }
}

function commitCurrentQuaternaryColor(rawValue) {
  const node = getGameNode();
  if (!node) return false;
  const currentColors = getCurrentGameColors();
  const nextValue = normalizeQuaternaryColorValue(
    rawValue,
    getQuaternaryColorFallback(currentColors.primaryColor, currentColors.secondaryColor)
  );
  if (!nextValue) return false;
  if (colorsMatch(node.quaternaryColor, nextValue)) return false;
  node.quaternaryColor = nextValue;
  return true;
}

if (tertiaryColorPickerInput) {
  tertiaryColorPickerInput.addEventListener('input', () => {
    if (!commitCurrentTertiaryColor(tertiaryColorPickerInput.value)) {
      syncCurrentTertiaryInputs();
      return;
    }
    syncCurrentTertiaryInputs();
    updatePhoneChrome();
    renderAll();
    scheduleRecoverySync();
  });
}

if (tertiaryColorInput) {
  tertiaryColorInput.addEventListener('input', () => {
    const supportedValue = getSupportedColorValue(tertiaryColorInput.value);
    const hasValue = !!tertiaryColorInput.value.trim();
    tertiaryColorInput.classList.toggle('is-invalid', hasValue && !supportedValue);
    if (!supportedValue) return;
    if (!commitCurrentTertiaryColor(supportedValue)) {
      syncCurrentTertiaryInputs();
      return;
    }
    syncCurrentTertiaryInputs();
    updatePhoneChrome();
    renderAll();
    scheduleRecoverySync();
  });

  tertiaryColorInput.addEventListener('blur', () => {
    syncCurrentTertiaryInputs();
  });
}

if (quaternaryColorPickerInput) {
  quaternaryColorPickerInput.addEventListener('input', () => {
    if (!commitCurrentQuaternaryColor(quaternaryColorPickerInput.value)) {
      syncCurrentQuaternaryInputs();
      return;
    }
    syncCurrentQuaternaryInputs();
    updatePhoneChrome();
    renderAll();
    scheduleRecoverySync();
  });
}

if (quaternaryColorInput) {
  quaternaryColorInput.addEventListener('input', () => {
    const supportedValue = getSupportedColorValue(quaternaryColorInput.value);
    const hasValue = !!quaternaryColorInput.value.trim();
    quaternaryColorInput.classList.toggle('is-invalid', hasValue && !supportedValue);
    if (!supportedValue) return;
    if (!commitCurrentQuaternaryColor(supportedValue)) {
      syncCurrentQuaternaryInputs();
      return;
    }
    syncCurrentQuaternaryInputs();
    updatePhoneChrome();
    renderAll();
    scheduleRecoverySync();
  });

  quaternaryColorInput.addEventListener('blur', () => {
    syncCurrentQuaternaryInputs();
  });
}

function addNewTag() {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  const value = nodeTagNewInput.value.trim();
  if (!value) return;
  const valueLower = value.toLowerCase();
  const existing = allTags.find(t => t.toLowerCase() === valueLower);
  const canonical = existing || value;
  if (!existing) {
    allTags.push(canonical);
    supabaseTags.push(canonical);
    // Try to save new tag to Supabase
    saveNewTagToSupabase(canonical).catch(err => console.warn('Failed to save tag to Supabase:', err));
  }
  if (!(node.tags || []).some(t => t.toLowerCase() === valueLower)) {
    node.tags = [...(node.tags || []), canonical];
  }
  nodeTagNewInput.value = '';
  renderTagPicker(node);
  syncPhoneStartButton();
  scheduleRecoverySync();
}

nodeTagAddBtn.addEventListener('click', addNewTag);
nodeTagNewInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addNewTag();
});

nodeBodyInput.addEventListener('input', () => {
  const node = getGameNode();
  if (!node || node.type !== 'game') return;
  node.body = nodeBodyInput.value;
  renderAll();
});

objectBodyInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node) return;
  node.body = objectBodyInput.value;
  refreshReplyBodyHint();
  rememberGuideInsertSelection();
  renderAll();
  updateVariableAutocomplete();
});

objectBodyInput.addEventListener('click', () => {
  rememberGuideInsertSelection();
  updateVariableAutocomplete();
});
objectBodyInput.addEventListener('focus', () => {
  rememberGuideInsertSelection();
  updateVariableAutocomplete();
});
objectBodyInput.addEventListener('select', rememberGuideInsertSelection);
objectBodyInput.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (document.activeElement !== objectBodyInput) closeVariableAutocomplete();
  }, 0);
});
objectBodyInput.addEventListener('keyup', (event) => {
  if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
  rememberGuideInsertSelection();
  updateVariableAutocomplete();
});
objectBodyInput.addEventListener('keydown', (event) => {
  if (!variableAutocomplete.open || !variableAutocomplete.items.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    variableAutocomplete.activeIndex = (variableAutocomplete.activeIndex + 1) % variableAutocomplete.items.length;
    renderVariableAutocomplete();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    variableAutocomplete.activeIndex = (variableAutocomplete.activeIndex - 1 + variableAutocomplete.items.length) % variableAutocomplete.items.length;
    renderVariableAutocomplete();
    return;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    applyVariableAutocomplete(variableAutocomplete.items[variableAutocomplete.activeIndex]);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeVariableAutocomplete();
  }
});

if (generateDescriptionBtn) {
  generateDescriptionBtn.addEventListener('click', () => {
    const node = getGameNode();
    if (!node || node.type !== 'game' || nodeBodyInput.disabled) {
      setGenerateDescriptionStatus('Open a game first.');
      return;
    }
    const nextDescription = buildLocalGameDescription(node);
    node.body = nextDescription;
    nodeBodyInput.value = nextDescription;
    setGenerateDescriptionStatus('Generate a description locally');
    renderAll();
  });
}

objectDeleteBtn.addEventListener('click', async () => {
  if (state.selectedLinkId) {
    removeSelectedLink();
    return;
  }
  await removeSelectedNode();
});
if (objectInsertBtn) {
  objectInsertBtn.addEventListener('pointerdown', (event) => {
    if (objectInsertBtn.disabled) return;
    rememberGuideInsertSelection();
    event.preventDefault();
  });
  objectInsertBtn.addEventListener('click', (event) => {
    event.preventDefault();
    toggleGuideInsertMenu();
  });
}
if (guideInsertMenu) {
  guideInsertMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}
if (guideInsertStoredInfoBtn) {
  guideInsertStoredInfoBtn.addEventListener('click', () => {
    openGuideInsertVariablePanel();
  });
}
if (guideInsertLinkBtn) {
  guideInsertLinkBtn.addEventListener('click', () => {
    openGuideInsertLinkPanel();
  });
}
if (guideInsertVariableBackBtn) {
  guideInsertVariableBackBtn.addEventListener('click', () => {
    showGuideInsertRoot();
    if (!guideInsertStoredInfoBtn) return;
    try {
      guideInsertStoredInfoBtn.focus({ preventScroll: true });
    } catch (error) {
      guideInsertStoredInfoBtn.focus();
    }
  });
}
if (guideInsertLinkBackBtn) {
  guideInsertLinkBackBtn.addEventListener('click', () => {
    showGuideInsertRoot();
    if (!guideInsertLinkBtn) return;
    try {
      guideInsertLinkBtn.focus({ preventScroll: true });
    } catch (error) {
      guideInsertLinkBtn.focus();
    }
  });
}
if (guideInsertLinkPanel) {
  guideInsertLinkPanel.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = String(guideInsertLinkTextInput ? guideInsertLinkTextInput.value : '').trim();
    const address = String(guideInsertLinkAddressInput ? guideInsertLinkAddressInput.value : '').trim();
    if (!text) {
      if (guideInsertLinkTextInput) guideInsertLinkTextInput.focus();
      return;
    }
    if (!address) {
      if (guideInsertLinkAddressInput) guideInsertLinkAddressInput.focus();
      return;
    }
    insertTextIntoGuideMessage('<A HREF="' + escapeInsertedHtml(address) + '">' + escapeInsertedHtml(text) + '</A>');
  });
}
if (guideInsertImageBtn) {
  guideInsertImageBtn.addEventListener('click', () => {
    openGuideInsertImagePanel();
  });
}
if (guideInsertImageBackBtn) {
  guideInsertImageBackBtn.addEventListener('click', () => {
    showGuideInsertRoot();
    if (!guideInsertImageBtn) return;
    try {
      guideInsertImageBtn.focus({ preventScroll: true });
    } catch (error) {
      guideInsertImageBtn.focus();
    }
  });
}
if (guideInsertImagePanel) {
  guideInsertImagePanel.addEventListener('submit', (event) => {
    event.preventDefault();
    const address = String(guideInsertImageAddressInput ? guideInsertImageAddressInput.value : '').trim();
    if (!address) {
      if (guideInsertImageAddressInput) guideInsertImageAddressInput.focus();
      return;
    }
    insertTextIntoGuideMessage('<IMG SRC="' + escapeInsertedHtml(address) + '">');
  });
}
if (duplicateGameBtn) {
  duplicateGameBtn.addEventListener('click', async () => {
    await duplicateCurrentGameAndOpen();
  });
}
if (featureGameBtn) {
  featureGameBtn.addEventListener('click', async () => {
    await toggleCurrentGameFeaturedState();
  });
}
if (archiveGameBtn) {
  archiveGameBtn.addEventListener('click', async () => {
    await toggleCurrentGameArchiveState();
  });
}
if (gameEraseBtn) {
  gameEraseBtn.addEventListener('click', () => {
    openGameEraseFlow();
  });
}
if (gameEraseBackdrop) {
  gameEraseBackdrop.addEventListener('click', (event) => {
    if (event.target === gameEraseBackdrop) closeGameEraseDialog('');
  });
}
if (gameEraseConfirmBtn) {
  gameEraseConfirmBtn.addEventListener('click', () => {
    closeGameEraseDialog('erase');
  });
}
if (gameArchiveConfirmBtn) {
  gameArchiveConfirmBtn.addEventListener('click', () => {
    closeGameEraseDialog('archive');
  });
}
if (gameEraseCancelBtn) {
  gameEraseCancelBtn.addEventListener('click', () => {
    closeGameEraseDialog('');
  });
}
if (saveGameBtn) saveGameBtn.addEventListener('click', saveCurrentGameFromMenu);
if (gamePickerSaveBtn) gamePickerSaveBtn.addEventListener('click', saveCurrentGameFromMenu);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveCurrentGameFromMenu();
  }
});
if (gamePickerPlayBtn) gamePickerPlayBtn.addEventListener('click', playCurrentGame);
if (builderAuthForm) {
  builderAuthForm.addEventListener('submit', handleBuilderAuthSubmit);
}
if (builderAuthResetBtn) {
  builderAuthResetBtn.addEventListener('click', handleBuilderPasswordReset);
}
if (builderAuthRequestBtn) {
  builderAuthRequestBtn.addEventListener('click', handleBuilderAccessRequest);
}
if (builderSignOutBtn) {
  builderSignOutBtn.addEventListener('click', handleBuilderSignOut);
}
if (gamePickerSelect) {
  gamePickerSelect.addEventListener('change', async () => {
    const selectedValue = String(gamePickerSelect.value || '').trim();
    if (!selectedValue || state.saveUiState === 'saving' || state.saveUiState === 'loading') {
      renderGamePickerSelect();
      return;
    }
    if (selectedValue === HEADER_GAME_PLACEHOLDER_VALUE) {
      renderGamePickerSelect();
      return;
    }
    if (selectedValue === HEADER_GAME_NEW_VALUE) {
      startNewPhone();
      return;
    }
    if (selectedValue === state.currentGameId) {
      renderGamePickerSelect();
      return;
    }
    await openSavedGameById(selectedValue, { preserveRecovery: hasPendingSaveChanges() });
  });
}
if (refreshPageBtn) {
  refreshPageBtn.addEventListener('click', () => {
    const menu = refreshPageBtn.closest('.mb-menu');
    const panel = refreshPageBtn.closest('.mb-panel');
    if (menu) menu.classList.remove('open');
    if (panel) panel.hidden = true;
    attemptRefresh();
  });
}
if (nodeContextMenu) {
  nodeContextMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}
if (waypointLibraryContextMenu) {
  waypointLibraryContextMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}
if (duplicateNodeBtn) {
  duplicateNodeBtn.addEventListener('click', () => {
    const nodeId = state.contextMenuNodeId;
    closeNodeContextMenu();
    if (!nodeId) return;
    duplicateNode(nodeId);
  });
}
if (deleteNodeMenuBtn) {
  deleteNodeMenuBtn.addEventListener('click', async () => {
    const nodeId = state.contextMenuNodeId;
    const linkId = state.contextMenuLinkId;
    closeNodeContextMenu();
    if (linkId) {
      selectLink(linkId);
      removeSelectedLink();
      return;
    }
    if (!nodeId) return;
    selectNode(nodeId);
    await removeSelectedNode();
  });
}
if (waypointLibraryOpenGameBtn) {
  waypointLibraryOpenGameBtn.addEventListener('click', async () => {
    const entryId = state.waypointLibraryContextEntryId;
    const entry = getWaypointLibraryEntry(entryId);
    closeWaypointLibraryContextMenu();
    if (!entry || !entry.sourceGameId) return;
    await openSavedGameById(entry.sourceGameId, { preserveRecovery: hasPendingSaveChanges() });
  });
}
if (waypointEraseBackdrop) {
  waypointEraseBackdrop.addEventListener('click', (event) => {
    if (event.target === waypointEraseBackdrop) closeWaypointEraseDialog('');
  });
}
if (waypointEraseOnlyBtn) {
  waypointEraseOnlyBtn.addEventListener('click', () => {
    closeWaypointEraseDialog('waypoint-only');
  });
}
if (waypointEraseBundleBtn) {
  waypointEraseBundleBtn.addEventListener('click', () => {
    closeWaypointEraseDialog('waypoint-and-bubbles');
  });
}
if (waypointEraseCancelBtn) {
  waypointEraseCancelBtn.addEventListener('click', () => {
    closeWaypointEraseDialog('');
  });
}
if (newPhoneBtn) newPhoneBtn.addEventListener('click', startNewPhone);

linkLayer.addEventListener('click', (event) => {
  if (event.target !== linkLayer) return;
  const point = phonePointFromClient(event.clientX, event.clientY);
  const linkId = findNearestLinkIdAtPoint(point.x, point.y);
  if (!linkId) return;
  event.preventDefault();
  event.stopPropagation();
  closeNodeContextMenu();
  selectLinkAndRefresh(linkId);
});

phoneStage.addEventListener('click', (event) => {
  closeNodeContextMenu();
  if (state.suppressBackgroundClick) {
    state.suppressBackgroundClick = false;
    return;
  }
  if (event.target.closest && event.target.closest('.node-shell')) return;
  if (
    event.target !== phoneStage
    && event.target !== phone
    && event.target !== nodeLayer
    && event.target !== linkLayer
  ) return;
  clearSelection();
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
});

viewport.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (state.dragNode || state.stencilDrag || state.connectDrag) return;
  const target = event.target;
  if (target.closest && target.closest('.node-shell')) return;
  if (target === linkLayer) {
    const point = phonePointFromClient(event.clientX, event.clientY);
    if (findNearestLinkIdAtPoint(point.x, point.y)) return;
  }
  const isPhoneTarget =
    target === viewport ||
    target === phoneStage ||
    target === phone ||
    target === nodeLayer ||
    target === linkLayer;
  if (!isPhoneTarget) return;

  event.preventDefault();
  state.panPhone = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: getViewportScrollPosition().left,
    scrollTop: getViewportScrollPosition().top,
    moved: false
  };
  viewport.classList.add('panning');
});

window.addEventListener('pointermove', (event) => {
  maybeStartWaypointLibraryDrag(event);
  maybeStartStencilDrag(event);

  if (state.inspectorDrag) {
    const dx = event.clientX - state.inspectorDrag.startX;
    const dy = event.clientY - state.inspectorDrag.startY;
    state.inspectorPosition = clampInspectorPosition(
      state.inspectorDrag.originX + dx,
      state.inspectorDrag.originY + dy
    );
    applyInspectorPosition();
    return;
  }

  if (state.stencilDrag) {
    positionGhost(state.stencilDrag.ghostEl, event.clientX, event.clientY);
    const point = phonePointFromClient(event.clientX, event.clientY);
    viewport.classList.toggle('drop-ready', point.inside);
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.waypointLibraryDrag) {
    positionGhost(state.waypointLibraryDrag.ghostEl, event.clientX, event.clientY);
    const point = phonePointFromClient(event.clientX, event.clientY);
    viewport.classList.toggle('drop-ready', point.inside);
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.dragNode) {
    const node = getNode(state.dragNode.id);
    const el = nodeEls.get(state.dragNode.id);
    if (!node || !el) return;
    if (state.dragNode.reorderOnly) {
      const point = phonePointFromClient(event.clientX, event.clientY);
      const movedEnough =
        Math.abs(event.clientX - state.dragNode.startClientX) > 3
        || Math.abs(event.clientY - state.dragNode.startClientY) > 3;
      if (movedEnough) state.dragNode.moved = true;
      const rawY = clamp(
        point.y - state.dragNode.offsetY,
        state.layoutMetrics?.threadTop || (PHONE_DEVICE_Y + PHONE_STATUSBAR_HEIGHT + PHONE_HEADER_HEIGHT),
        getPhoneStageSize().height - node.height - 24
      );
      node.x = state.dragNode.originX;
      if (!state.dragNode.moved) {
        node.y = rawY;
        state.dropSlot = null;
        hideBubbleDropLine();
        el.style.removeProperty('--drag-tilt');
        positionNodeElement(node, el);
        renderSelectionStates();
        maybeAutoPan(event.clientX, event.clientY);
        return;
      }
      const bubbleMidY = rawY + (node.height / 2);
      const dropSlot = getNearestPhoneDropSlot(bubbleMidY, node.id);
      state.dropSlot = dropSlot;
      if (dropSlot) {
        showBubbleDropLine(dropSlot);
      } else {
        hideBubbleDropLine();
      }
      const snapTargetY = dropSlot ? dropSlot.previewY : rawY;
      const snapDistance = Math.abs(rawY - snapTargetY);
      const snapStrength = clamp((120 - snapDistance) / 120, 0, 1);
      let previewY = rawY + ((snapTargetY - rawY) * (0.28 + (snapStrength * 0.56)));
      if (snapDistance < 10) previewY = snapTargetY;
      node.y = Math.round(previewY);
      const side = getPhoneBubbleSide(node);
      const sideBias = side === 'right' ? 1.15 : side === 'left' ? -1.15 : 0;
      const dragTilt = clamp(sideBias + ((event.clientX - state.dragNode.startClientX) / 34), -4.5, 4.5);
      el.style.setProperty('--drag-tilt', dragTilt.toFixed(2) + 'deg');
      positionNodeElement(node, el);
      renderSelectionStates();
      maybeAutoPan(event.clientX, event.clientY);
      return;
    }
    const point = phonePointFromClient(event.clientX, event.clientY);
    const anytimePairNodeIds = new Set(state.dragNode.anytimePairNodeIds || []);
    const isLockedAnytimeDrag = anytimePairNodeIds.size > 1;
    const movedEnough =
      Math.abs(event.clientX - state.dragNode.startClientX) > 3
      || Math.abs(event.clientY - state.dragNode.startClientY) > 3;
    if (movedEnough && !state.dragNode.moved) {
      state.dragNode.moved = true;
      if (!isLockedAnytimeDrag) {
        state.doc.links = state.doc.links.filter((link) => link.to !== state.dragNode.id);
      }
    }
    const bounds = getPlacementBounds(node.width, node.height);
    const nextX = clamp(point.x - state.dragNode.offsetX, bounds.minX, bounds.maxX);
    const nextY = clamp(point.y - state.dragNode.offsetY, bounds.minY, bounds.maxY);
    const dockCandidate = state.dragNode.moved
      ? getDockCandidateForNode(node, nextX, nextY, state.dragNode.subtreeIds)
      : null;
    const snapped = dockCandidate
      ? { x: dockCandidate.x, y: dockCandidate.y }
      : maybeSnapToMajorGrid(node.type, nextX, nextY, isLockedAnytimeDrag ? anytimePairNodeIds : node.id);
    state.dragNode.dockCandidate = dockCandidate;
    state.dockTargetId = dockCandidate ? dockCandidate.sourceId : null;
    const dx = snapped.x - node.x;
    const dy = snapped.y - node.y;
    node.x = snapped.x;
    node.y = snapped.y;
    if (isLockedAnytimeDrag && (dx !== 0 || dy !== 0)) {
      (state.dragNode.anytimePairNodeIds || []).forEach((pairNodeId) => {
        if (pairNodeId === node.id) return;
        const pairNode = getNode(pairNodeId);
        const pairEl = nodeEls.get(pairNodeId);
        if (!pairNode) return;
        const pairBounds = getPlacementBounds(pairNode.width, pairNode.height);
        pairNode.x = clamp(pairNode.x + dx, pairBounds.minX, pairBounds.maxX);
        pairNode.y = clamp(pairNode.y + dy, pairBounds.minY, pairBounds.maxY);
        if (pairEl) positionNodeElement(pairNode, pairEl);
      });
    }
    positionNodeElement(node, el);
    if (state.dragNode.moved) {
      layoutOutgoingSubtree(node.id);
    }
    renderSelectionStates();
    drawLinks();
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.connectDrag) {
    const point = phonePointFromClient(event.clientX, event.clientY);
    const stageSize = getPhoneStageSize();
    state.connectDrag.x = clamp(point.x, 0, stageSize.width);
    state.connectDrag.y = clamp(point.y, 0, stageSize.height);
    updateHoverTarget(event.clientX, event.clientY);
    drawLinks();
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.panPhone) {
    const dx = event.clientX - state.panPhone.startX;
    const dy = event.clientY - state.panPhone.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.panPhone.moved = true;
    }
    setViewportScrollPosition(
      state.panPhone.scrollLeft - dx,
      state.panPhone.scrollTop - dy
    );
  }
});

window.addEventListener('pointerup', (event) => {
  if (state.inspectorDrag) {
    if (inspector) inspector.classList.remove('dragging');
    state.inspectorDrag = null;
  }

  if (state.waypointLibraryDrag) stopWaypointLibraryDrag(event.clientX, event.clientY);
  clearWaypointLibraryPress();
  if (state.stencilDrag) stopStencilDrag(event.clientX, event.clientY);
  clearStencilPress();

  if (state.dragNode) {
    const dragState = state.dragNode;
    const el = nodeEls.get(state.dragNode.id);
    if (el) el.classList.remove('dragging');
    if (dragState.reorderOnly) {
      const node = getNode(dragState.id);
      if (node && dragState.moved && state.dropSlot) {
        node.x = dragState.originX;
        node.y = Math.round(state.dropSlot.sortY);
        reorderPhoneThreadNode(node.id, state.dropSlot.insertIndex);
      }
      if (el) el.style.removeProperty('--drag-tilt');
      hideBubbleDropLine();
      state.dropSlot = null;
      state.dragNode = null;
      state.dockTargetId = null;
      if (dragState.moved) renderAll();
      else renderSelectionStates();
      return;
    }
    if (dragState.moved) {
      const node = getNode(dragState.id);
      if (node && dragState.dockCandidate) {
        createLink(dragState.dockCandidate.sourceId, node.id, dragState.dockCandidate.fromPort);
        const sourceNode = getNode(dragState.dockCandidate.sourceId);
        if (sourceNode) snapLinkedNodeToSource(node, sourceNode, dragState.dockCandidate.fromPort);
      }
      if (node) layoutOutgoingSubtree(node.id);
    }
    state.dragNode = null;
    state.dockTargetId = null;
    if (dragState.moved) renderAll();
    else renderSelectionStates();
  }

  if (state.connectDrag) stopConnectDrag(event.clientX, event.clientY);

  if (state.panPhone) {
    if (state.panPhone.moved) {
      state.suppressBackgroundClick = true;
    }
    state.panPhone = null;
    viewport.classList.remove('panning');
  }
});

window.addEventListener('pointercancel', () => {
  clearWaypointLibraryPress();
  cancelWaypointLibraryDrag();
  clearStencilPress();
  cancelStencilDrag();
});

window.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement && document.activeElement.tagName;
  const isTyping =
    activeTag === 'INPUT'
    || activeTag === 'TEXTAREA'
    || activeTag === 'SELECT'
    || (document.activeElement && document.activeElement.isContentEditable);

  if (isGuideImageLightboxOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGuideImageLightbox();
    }
    return;
  }

  if (isGameEraseDialogOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGameEraseDialog('');
    }
    return;
  }

  if (isWaypointEraseDialogOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWaypointEraseDialog('');
    }
    return;
  }

  if (((nodeContextMenu && !nodeContextMenu.hidden) || (waypointLibraryContextMenu && !waypointLibraryContextMenu.hidden)) && event.key === 'Escape') {
    event.preventDefault();
    closeAllContextMenus();
    return;
  }

  if (isGuideInsertMenuOpen() && event.key === 'Escape') {
    event.preventDefault();
    closeGuideInsertMenu();
    return;
  }


  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveCurrentGameFromMenu();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    playCurrentGame();
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyN')) {
    event.preventDefault();
    startNewPhone();
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyW')) {
    event.preventDefault();
    addNodeToVisiblePhone('stop');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyT')) {
    event.preventDefault();
    addNodeToVisiblePhone('bubble', 'text');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyI')) {
    event.preventDefault();
    addNodeToVisiblePhone('bubble', 'image');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyV')) {
    event.preventDefault();
    addNodeToVisiblePhone('bubble', 'video');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyL')) {
    event.preventDefault();
    addNodeToVisiblePhone('bubble', 'link');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyP')) {
    event.preventDefault();
    addNodeToVisiblePhone('reply');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyB')) {
    event.preventDefault();
    addNodeToVisiblePhone('button');
    return;
  }

  if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace') && (state.selectedId || state.selectedLinkId)) {
    event.preventDefault();
    if (state.selectedLinkId) removeSelectedLink();
    else removeSelectedNode();
  }
});

window.addEventListener('pointerdown', (event) => {
  if (!isGuideInsertMenuOpen()) return;
  const target = event.target;
  if (
    (guideInsertMenu && guideInsertMenu.contains(target))
    || (objectInsertBtn && objectInsertBtn.contains(target))
  ) {
    return;
  }
  closeGuideInsertMenu({ restoreFocus: false });
});

window.addEventListener('resize', () => {
  if (!isGuideInsertMenuOpen()) return;
  positionGuideInsertMenu();
});

if (builderTutorialBackBtn) {
  builderTutorialBackBtn.addEventListener('click', () => {
    openBuilderTutorialStep(state.builderTutorialIndex - 1);
  });
}

if (builderTutorialNextBtn) {
  builderTutorialNextBtn.addEventListener('click', () => {
    const steps = getBuilderTutorialSteps();
    if (!steps.length) {
      closeBuilderTutorial();
      return;
    }
    if (state.builderTutorialIndex >= steps.length - 1) {
      closeBuilderTutorial();
      return;
    }
    openBuilderTutorialStep(state.builderTutorialIndex + 1);
  });
}

if (builderTutorialCloseBtn) {
  builderTutorialCloseBtn.addEventListener('click', () => {
    closeBuilderTutorial();
  });
}

window.addEventListener('keydown', (event) => {
  if (!state.builderTutorialActive) return;
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeBuilderTutorial();
});

window.addEventListener('scroll', () => {
  if (!state.builderTutorialActive) return;
  positionBuilderTutorialPopover();
}, true);

// ── Menubar dropdowns ──────────────────────────────────────────────────────
(function () {
  const nav = document.getElementById('mbNav');
  if (!nav) return;

  function closeAll() {
    nav.querySelectorAll('.mb-menu').forEach((m) => {
      m.classList.remove('open');
      const panel = document.getElementById(m.querySelector('[data-target]').dataset.target);
      if (panel) panel.hidden = true;
    });
  }

  nav.querySelectorAll('.mb-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const panelId = trigger.dataset.target;
      const menu = trigger.closest('.mb-menu');
      const panel = document.getElementById(panelId);
      const isOpen = !panel.hidden;
      closeAll();
      if (!isOpen) { panel.hidden = false; menu.classList.add('open'); }
    });
  });

  nav.querySelectorAll('.mb-panel').forEach((panel) => {
    panel.addEventListener('click', (e) => e.stopPropagation());
  });

  document.addEventListener('click', closeAll);

}());

window.addEventListener('pointerdown', (event) => {
  const target = event.target;
  const nodeMenuOpen = !!(nodeContextMenu && !nodeContextMenu.hidden);
  const libraryMenuOpen = !!(waypointLibraryContextMenu && !waypointLibraryContextMenu.hidden);
  if (!nodeMenuOpen && !libraryMenuOpen) return;
  if (nodeMenuOpen && nodeContextMenu.contains(target)) return;
  if (libraryMenuOpen && waypointLibraryContextMenu.contains(target)) return;
  closeAllContextMenus();
});

window.addEventListener('resize', () => {
  applyZoom();
  drawLinks();
  applyInspectorPosition();
  refreshGameshelfAutoScroll();
  if (state.builderTutorialActive) positionBuilderTutorialPopover();
});

window.addEventListener('beforeunload', (event) => {
  if (!canSaveCurrentGame()) return;
  syncRecoveryDraftNow({ updateStatus: false });
  event.preventDefault();
  event.returnValue = '';
});

if (inspector) {
  inspector.addEventListener('input', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      updateActionUi();
    }
  });
}


window.addEventListener('pagehide', () => {
  if (!canSaveCurrentGame()) return;
  syncRecoveryDraftNow({ updateStatus: false });
});

async function initializeBuilder() {
  startPhoneClock();
  applyZoom();
  setGameDetailsCollapsed(false);
  await loadDoc();
  await refreshHeaderGames();
  await mergeAllGameTagsToSupabase().catch(err => console.warn('Failed to merge game tags to Supabase:', err));
  await refreshWaypointLibrary();
  startBuilderTutorialIfNeeded();
}

bootstrapBuilder();





const fieldTooltipLayer = document.createElement('div');
fieldTooltipLayer.id = 'fieldTooltipLayer';
fieldTooltipLayer.setAttribute('role', 'tooltip');
fieldTooltipLayer.setAttribute('aria-hidden', 'true');
document.body.appendChild(fieldTooltipLayer);

let activeFieldTooltipInfo = null;

function getFieldTooltipText(info) {
  if (!info) return '';
  const tooltip = info.querySelector('.field-tooltip');
  const tooltipText = tooltip ? tooltip.textContent.trim() : '';
  return tooltipText || (info.getAttribute('aria-label') || '').trim();
}

function positionFieldTooltip(info) {
  if (!info || activeFieldTooltipInfo !== info) return;
  const rect = info.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    hideFieldTooltip();
    return;
  }
  const layerRect = fieldTooltipLayer.getBoundingClientRect();
  const gap = 8;
  let left = rect.left + rect.width / 2 - layerRect.width / 2;
  left = Math.max(gap, Math.min(left, window.innerWidth - layerRect.width - gap));
  let top = rect.bottom + gap;
  if (top + layerRect.height > window.innerHeight - gap) {
    top = Math.max(gap, rect.top - layerRect.height - gap);
  }
  fieldTooltipLayer.style.left = Math.round(left) + 'px';
  fieldTooltipLayer.style.top = Math.round(top) + 'px';
}

function showFieldTooltip(info) {
  const tooltipText = getFieldTooltipText(info);
  if (!tooltipText) return;
  activeFieldTooltipInfo = info;
  fieldTooltipLayer.textContent = tooltipText;
  fieldTooltipLayer.classList.add('is-visible');
  fieldTooltipLayer.setAttribute('aria-hidden', 'false');
  positionFieldTooltip(info);
}

function hideFieldTooltip(info = activeFieldTooltipInfo) {
  if (!activeFieldTooltipInfo) return;
  if (info && activeFieldTooltipInfo !== info) return;
  activeFieldTooltipInfo = null;
  fieldTooltipLayer.classList.remove('is-visible');
  fieldTooltipLayer.setAttribute('aria-hidden', 'true');
}

document.addEventListener('mouseover', (e) => {
  const info = e.target.closest('.field-info');
  if (!info) return;
  const related = e.relatedTarget;
  if (related && info.contains(related)) return;
  showFieldTooltip(info);
});

document.addEventListener('mouseout', (e) => {
  const info = e.target.closest('.field-info');
  if (!info) return;
  const related = e.relatedTarget;
  if (related && info.contains(related)) return;
  hideFieldTooltip(info);
});

document.addEventListener('focusin', (e) => {
  const info = e.target.closest('.field-info');
  if (!info) return;
  showFieldTooltip(info);
});

document.addEventListener('focusout', (e) => {
  const info = e.target.closest('.field-info');
  if (!info) return;
  const related = e.relatedTarget;
  if (related && info.contains(related)) return;
  hideFieldTooltip(info);
});

window.addEventListener('scroll', () => {
  if (!activeFieldTooltipInfo) return;
  if (!document.body.contains(activeFieldTooltipInfo)) {
    hideFieldTooltip();
    return;
  }
  positionFieldTooltip(activeFieldTooltipInfo);
}, true);

window.addEventListener('resize', () => {
  if (!activeFieldTooltipInfo) return;
  positionFieldTooltip(activeFieldTooltipInfo);
});

  