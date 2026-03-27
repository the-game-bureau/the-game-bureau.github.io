const LOCAL_OPEN_GAME_KEY = 'tgb-games-phoneanalogy-open';
const STORE_COMMENT = 'Supabase-backed game builder store.';
const DEFAULT_SUPABASE_GAMES_TABLE = 'games';
const SUPABASE_CONFIG_STORAGE_KEY = 'tgb-builder-supabase-config';
const EDITOR_PAGE_ROUTE = 'builder.html';
const BIC_BLUE_INK = '#2f5cc2';

const EMPTY_STORE = {
  _comment: STORE_COMMENT,
  updatedAt: '',
  games: []
};

const TYPE_CONFIG = {
  game: {
    width: 184,
    height: 318
  }
};

const gamesGrid = document.getElementById('gamesGrid');
const newGameLink = document.getElementById('newGameLink');
const editGameLink = document.getElementById('editGameLink');
const renameGameLink = document.getElementById('renameGameLink');
const duplicateGameLink = document.getElementById('duplicateGameLink');
const deleteGameBtn = document.getElementById('deleteGameBtn');
const gamesContextMenu = document.getElementById('gamesContextMenu');
const gamesMenuNewBtn = document.getElementById('gamesMenuNewBtn');
const gamesMenuEditBtn = document.getElementById('gamesMenuEditBtn');
const gamesMenuRenameBtn = document.getElementById('gamesMenuRenameBtn');
const gamesMenuDuplicateBtn = document.getElementById('gamesMenuDuplicateBtn');
const gamesMenuDeleteBtn = document.getElementById('gamesMenuDeleteBtn');
const eraseConfirmBackdrop = document.getElementById('eraseConfirmBackdrop');
const eraseConfirmGameName = document.getElementById('eraseConfirmGameName');
const eraseConfirmYesBtn = document.getElementById('eraseConfirmYesBtn');
const eraseConfirmNoBtn = document.getElementById('eraseConfirmNoBtn');

const state = {
  store: cloneObj(EMPTY_STORE),
  selectedGameId: '',
  contextMenuGameId: '',
  readOnly: false,
  supabaseStatusMessage: '',
  eraseConfirmResolver: null,
  eraseConfirmPreviousFocus: null
};

const supabaseConfig = readSupabaseConfig();

function cloneObj(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function buildSupabaseTableUrl(tableName, params = null) {
  if (!hasSupabaseStore()) return '';
  const url = new URL('/rest/v1/' + encodeURIComponent(tableName), supabaseConfig.url + '/');
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

function getLatestStoreTimestamp(games = []) {
  return games.reduce((latest, game) => {
    const candidates = [game && game.updatedAt, game && game.createdAt];
    candidates.forEach((value) => {
      if (typeof value !== 'string' || !value.trim()) return;
      const latestTime = Date.parse(latest || '');
      const candidateTime = Date.parse(value);
      if (!Number.isFinite(candidateTime)) return;
      if (!latest || !Number.isFinite(latestTime) || candidateTime > latestTime) {
        latest = value;
      }
    });
    return latest;
  }, '');
}

function buildStoreFromGames(games = []) {
  return normalizeStore({
    updatedAt: getLatestStoreTimestamp(games),
    games
  });
}

function serializeGameRow(game, index = 0) {
  const normalizedGame = normalizeGameEntry(game, index);
  const timestamp = normalizedGame.updatedAt || normalizedGame.createdAt || new Date().toISOString();
  return {
    id: normalizedGame.id,
    name: normalizedGame.name || 'Untitled Game',
    created_at: normalizedGame.createdAt || timestamp,
    updated_at: timestamp,
    primary_color: normalizedGame.primaryColor || null,
    secondary_color: normalizedGame.secondaryColor || null,
    nodes: Array.isArray(normalizedGame.nodes) ? normalizedGame.nodes : [],
    links: Array.isArray(normalizedGame.links) ? normalizedGame.links : []
  };
}

function normalizeGameRow(row, index = 0) {
  return normalizeGameEntry({
    id: row && row.id,
    name: row && row.name,
    createdAt: row && typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: row && typeof row.updated_at === 'string' ? row.updated_at : '',
    primaryColor: row && typeof row.primary_color === 'string' ? row.primary_color : '',
    secondaryColor: row && typeof row.secondary_color === 'string' ? row.secondary_color : '',
    nodes: Array.isArray(row && row.nodes) ? row.nodes : [],
    links: Array.isArray(row && row.links) ? row.links : []
  }, index);
}

function getErrorMessage(error, fallbackMessage) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return fallbackMessage;
}

function showSupabaseError(error, fallbackMessage) {
  const message = getErrorMessage(error, fallbackMessage);
  try {
    window.alert(message);
  } catch (alertError) {
  }
  return message;
}

function persistStoreLocally() {
  try {
    if (state.selectedGameId) {
      localStorage.setItem(LOCAL_OPEN_GAME_KEY, state.selectedGameId);
    } else {
      localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
    }
  } catch (error) {
  }
}

async function fetchGameRowsFromSupabase() {
  const response = await fetch(buildSupabaseTableUrl(supabaseConfig.gamesTable, {
    select: 'id,name,created_at,updated_at,primary_color,secondary_color,nodes,links',
    order: 'name.asc'
  }), {
    cache: 'no-store',
    headers: getSupabaseHeaders({
      Accept: 'application/json'
    })
  });
  if (!response.ok) {
    throw new Error(await response.text() || 'Supabase games load failed.');
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadStoreFromSupabase() {
  if (!hasSupabaseStore()) {
    return {
      store: null,
      error: new Error('Add your Supabase project URL and publishable key in supabase-config.js.')
    };
  }

  try {
    const rows = await fetchGameRowsFromSupabase();
    const games = rows.map((row, index) => normalizeGameRow(row, index));
    return {
      store: buildStoreFromGames(games),
      error: null
    };
  } catch (error) {
    return {
      store: null,
      error
    };
  }
}

async function syncGameToSupabase(game) {
  if (!hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.')
    };
  }

  try {
    const payload = serializeGameRow(game, state.store.games.findIndex((entry) => entry && entry.id === game.id));
    const response = await fetch(buildSupabaseTableUrl(supabaseConfig.gamesTable, {
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
      throw new Error(await response.text() || 'Supabase save failed.');
    }
    return { serverSaved: true, error: null };
  } catch (error) {
    return { serverSaved: false, error };
  }
}

async function renameGameInSupabase(previousGameId, game) {
  if (!hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.')
    };
  }

  try {
    const payload = serializeGameRow(game, state.store.games.findIndex((entry) => entry && entry.id === previousGameId));
    const response = await fetch(buildSupabaseTableUrl(supabaseConfig.gamesTable, {
      id: 'eq.' + previousGameId
    }), {
      method: 'PATCH',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase rename failed.');
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('Supabase rename did not update any rows.');
    }
    return { serverSaved: true, error: null };
  } catch (error) {
    return { serverSaved: false, error };
  }
}

async function deleteGameFromSupabase(gameId) {
  if (!hasSupabaseStore()) {
    return {
      serverSaved: false,
      error: new Error('Supabase is not configured.')
    };
  }

  try {
    const response = await fetch(buildSupabaseTableUrl(supabaseConfig.gamesTable, {
      id: 'eq.' + gameId
    }), {
      method: 'DELETE',
      headers: getSupabaseHeaders({
        Prefer: 'return=minimal'
      })
    });
    if (!response.ok) {
      throw new Error(await response.text() || 'Supabase delete failed.');
    }
    return { serverSaved: true, error: null };
  } catch (error) {
    return { serverSaved: false, error };
  }
}

function getRawGameNodeTitle(rawGame) {
  const gameNode = Array.isArray(rawGame && rawGame.nodes)
    ? rawGame.nodes.find((node) => node && node.type === 'game' && typeof node.title === 'string' && node.title.trim())
    : null;
  return gameNode ? gameNode.title.trim() : '';
}

function deriveSavedGameColors(game, index = 0) {
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

function colorValueToHex(rawValue, fallback = BIC_BLUE_INK) {
  const color = getSupportedColorValue(rawValue) || getSupportedColorValue(fallback) || BIC_BLUE_INK;
  if (!document.body) return color.startsWith('#') ? color : fallback;

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const match = resolved.match(/rgba?\(([^)]+)\)/i);
  if (!match) return color.startsWith('#') ? color : fallback;

  const [r, g, b] = match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Math.max(0, Math.min(255, Math.round(Number.parseFloat(part.trim()) || 0))));

  return '#' + [r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function colorValueToRgba(rawValue, alpha = 1, fallback = BIC_BLUE_INK) {
  const hex = colorValueToHex(rawValue, fallback);
  const normalized = hex.startsWith('#') ? hex.slice(1) : BIC_BLUE_INK.slice(1);
  const safeHex = (normalized.length === 3
    ? normalized.split('').map((value) => value + value).join('')
    : normalized.padEnd(6, '0')).slice(0, 6);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(safeHex.slice(offset, offset + 2), 16) || 0);
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${clampedAlpha})`;
}

function getTertiaryGameColor(rawValue, fallback = BIC_BLUE_INK) {
  const hex = colorValueToHex(rawValue, fallback);
  const normalized = hex.startsWith('#') ? hex.slice(1) : BIC_BLUE_INK.slice(1);
  const safeHex = (normalized.length === 3
    ? normalized.split('').map((value) => value + value).join('')
    : normalized.padEnd(6, '0')).slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(safeHex.slice(offset, offset + 2), 16) || 0);
  const distanceToBlack = (r * r) + (g * g) + (b * b);
  const distanceToWhite = ((255 - r) * (255 - r)) + ((255 - g) * (255 - g)) + ((255 - b) * (255 - b));
  return distanceToBlack >= distanceToWhite ? '#000000' : '#ffffff';
}

function normalizeGameEntry(rawGame, index = 0) {
  const colors = getSavedGameColors(rawGame, index);
  return {
    id: rawGame && rawGame.id ? String(rawGame.id) : 'game-' + (index + 1),
    name: rawGame && typeof rawGame.name === 'string' && rawGame.name.trim()
      ? rawGame.name.trim()
      : (getRawGameNodeTitle(rawGame) || 'Untitled Game'),
    createdAt: rawGame && typeof rawGame.createdAt === 'string' ? rawGame.createdAt : (rawGame && typeof rawGame.updatedAt === 'string' ? rawGame.updatedAt : ''),
    updatedAt: rawGame && typeof rawGame.updatedAt === 'string' ? rawGame.updatedAt : '',
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    nodes: Array.isArray(rawGame && rawGame.nodes) ? cloneObj(rawGame.nodes) : [],
    links: Array.isArray(rawGame && rawGame.links) ? cloneObj(rawGame.links) : []
  };
}

function normalizeStore(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  let games = [];

  if (Array.isArray(incoming.games)) {
    games = incoming.games.map((game, index) => normalizeGameEntry(game, index));
  } else if (Array.isArray(incoming.nodes) || Array.isArray(incoming.links)) {
    games = [normalizeGameEntry(incoming, 0)];
  }

  return {
    _comment: STORE_COMMENT,
    updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : '',
    games
  };
}

function convertLegacyGamesToStore(legacyGames = []) {
  const games = legacyGames
    .filter((game) => game && !game.archived)
    .map((game, index) => ({
      id: game.id || ('game-' + index),
      name: game.name || 'Untitled Game',
      createdAt: game.createdAt || game.updatedAt || '',
      updatedAt: game.updatedAt || '',
      primaryColor: '',
      secondaryColor: '',
      nodes: [{
        id: 'gm-01',
        type: 'game',
        x: 64,
        y: 64,
        width: TYPE_CONFIG.game.width,
        height: TYPE_CONFIG.game.height,
        title: game.name || 'Untitled Game',
        tagline: game.tagline || '',
        guideName: game.subtitle || '',
        price: game.price || '',
        tags: (game.tag || '').split(/[;,]/).map((tag) => tag.trim()).filter(Boolean),
        body: (game.description || '').replace(/<[^>]+>/g, '').trim()
      }],
      links: []
    }));

  return normalizeStore({ games });
}

function normalizeIncomingStorePayload(raw) {
  if (Array.isArray(raw)) {
    const looksLikeCurrentStore = raw.some((game) => game && typeof game === 'object' && (Array.isArray(game.nodes) || Array.isArray(game.links)));
    return looksLikeCurrentStore ? normalizeStore({ games: raw }) : convertLegacyGamesToStore(raw);
  }

  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.nodes) || Array.isArray(raw.links)) return normalizeStore(raw);
  if (Array.isArray(raw.games)) {
    const looksLikeCurrentStore = raw.games.some((game) => game && typeof game === 'object' && (Array.isArray(game.nodes) || Array.isArray(game.links)));
    return looksLikeCurrentStore ? normalizeStore(raw) : convertLegacyGamesToStore(raw.games);
  }

  return null;
}

function compareSavedGamesAlphabetical(a, b) {
  return String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { sensitivity: 'base' });
}

function getSortedGames() {
  return [...state.store.games].sort(compareSavedGamesAlphabetical);
}

function buildDuplicateGameName(baseName = 'Untitled Game') {
  const sourceName = String(baseName || 'Untitled Game').trim() || 'Untitled Game';
  const names = new Set((state.store.games || []).map((game) => String(game && game.name || '').trim().toLowerCase()));
  const firstCandidate = sourceName + ' Copy';
  if (!names.has(firstCandidate.toLowerCase())) return firstCandidate;
  let copyIndex = 2;
  while (names.has((sourceName + ' Copy ' + copyIndex).toLowerCase())) {
    copyIndex += 1;
  }
  return sourceName + ' Copy ' + copyIndex;
}

function slugifyGameId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildUniqueGameIdFromName(name, ignoredGameId = '') {
  const ignoredId = String(ignoredGameId || '').trim();
  const baseId = slugifyGameId(name) || 'untitled-game';
  const usedIds = new Set(
    (state.store.games || [])
      .filter((game) => game && String(game.id || '').trim() !== ignoredId)
      .map((game) => String(game.id || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  let candidateId = `${baseId}-${suffix}`;
  while (usedIds.has(candidateId)) {
    suffix += 1;
    candidateId = `${baseId}-${suffix}`;
  }
  return candidateId;
}

function makeGameId() {
  return 'game-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function getSelectedGame() {
  return state.store.games.find((game) => game && game.id === state.selectedGameId) || null;
}

function getGameById(gameId) {
  const targetId = String(gameId || '').trim();
  if (!targetId) return null;
  return state.store.games.find((game) => game && game.id === targetId) || null;
}

function getEditableGameTitleNode(game) {
  return Array.isArray(game && game.nodes)
    ? game.nodes.find((node) => node && node.type === 'game')
    : null;
}

function clearSelectedGame() {
  state.selectedGameId = '';
  try {
    localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
  } catch (error) {
  }
  renderGames();
  updateActionUi();
}

function setSelectedGame(gameId) {
  const nextGameId = String(gameId || '').trim();
  if (!nextGameId) {
    clearSelectedGame();
    return;
  }
  if (nextGameId === state.selectedGameId) {
    clearSelectedGame();
    return;
  }
  state.selectedGameId = nextGameId;
  try {
    if (state.selectedGameId) localStorage.setItem(LOCAL_OPEN_GAME_KEY, state.selectedGameId);
  } catch (error) {
  }
  renderGames();
  updateActionUi();
}

function setActionLinkState(link, enabled, href = '') {
  if (!link) return;
  if (enabled) {
    if (href) {
      link.setAttribute('href', href);
    } else {
      link.removeAttribute('href');
    }
    link.classList.remove('is-disabled');
    link.removeAttribute('aria-disabled');
    link.tabIndex = 0;
    return;
  }
  link.removeAttribute('href');
  link.classList.add('is-disabled');
  link.setAttribute('aria-disabled', 'true');
  link.tabIndex = -1;
}

function updateActionUi() {
  const selectedGame = getSelectedGame();
  const hasSelection = !!selectedGame;
  const canMutate = !state.readOnly;
  setActionLinkState(newGameLink, true, buildEditorUrl({ newGame: true }));
  setActionLinkState(editGameLink, true, selectedGame ? buildEditorUrl({ gameId: selectedGame.id }) : buildEditorUrl());
  setActionLinkState(renameGameLink, hasSelection && canMutate, '#rename');
  setActionLinkState(duplicateGameLink, hasSelection && canMutate, '#duplicate');
  if (deleteGameBtn) deleteGameBtn.disabled = !hasSelection || !canMutate;
  if (gamesMenuNewBtn) gamesMenuNewBtn.disabled = false;
  if (gamesMenuEditBtn) gamesMenuEditBtn.disabled = false;
  if (gamesMenuRenameBtn) gamesMenuRenameBtn.disabled = !hasSelection || !canMutate;
  if (gamesMenuDuplicateBtn) gamesMenuDuplicateBtn.disabled = !hasSelection || !canMutate;
  if (gamesMenuDeleteBtn) gamesMenuDeleteBtn.disabled = !hasSelection || !canMutate;
}

function applyTileColors(button, game, index) {
  const colors = getSavedGameColors(game, index);
  const tertiaryColor = getTertiaryGameColor(colors.primaryColor, BIC_BLUE_INK);
  button.style.setProperty('--game-primary', colors.primaryColor);
  button.style.setProperty('--game-primary-glow', colorValueToRgba(colors.primaryColor, 0.34, BIC_BLUE_INK));
  button.style.setProperty('--game-primary-glow-strong', colorValueToRgba(colors.primaryColor, 0.58, BIC_BLUE_INK));
  button.style.setProperty('--game-secondary', colors.secondaryColor);
  button.style.setProperty('--game-secondary-glow', colorValueToRgba(colors.secondaryColor, 0.26, BIC_BLUE_INK));
  button.style.setProperty('--game-secondary-glow-strong', colorValueToRgba(colors.secondaryColor, 0.42, BIC_BLUE_INK));
  button.style.setProperty('--game-tertiary', tertiaryColor);
  button.style.setProperty('--game-outline', tertiaryColor);
}

function buildGameTile(game, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'game-tile' + (game.id === state.selectedGameId ? ' is-selected' : '');
  button.dataset.gameId = game.id;
  button.setAttribute('aria-pressed', game.id === state.selectedGameId ? 'true' : 'false');
  button.innerHTML = `
    <span class="game-tile-screen" aria-hidden="true"></span>
    <span class="game-tile-label">${escapeHtml(game.name || 'Untitled Game')}</span>
  `;
  applyTileColors(button, game, index);
  button.addEventListener('click', () => setSelectedGame(game.id));
  button.addEventListener('dblclick', () => {
    editSelectedGame(game.id);
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    setSelectedGame(game.id);
    openGamesContextMenu(event.clientX, event.clientY, game.id);
  });
  return button;
}

function renderGames() {
  if (!gamesGrid) return;
  gamesGrid.innerHTML = '';
  const games = getSortedGames();

  if (state.supabaseStatusMessage) {
    const notice = document.createElement('p');
    notice.className = 'games-empty-copy games-status-copy';
    notice.textContent = state.supabaseStatusMessage;
    gamesGrid.appendChild(notice);
  }

  if (!games.length) {
    const empty = document.createElement('div');
    empty.className = 'games-empty';
    if (state.readOnly && state.supabaseStatusMessage) {
      const message = document.createElement('p');
      message.className = 'games-empty-copy';
      message.textContent = 'Run builder/supabase.sql and reload the page.';
      empty.appendChild(message);
    } else {
      const message = document.createElement('p');
      message.className = 'games-empty-copy';
      message.textContent = 'No games yet. Choose New to start one.';
      empty.appendChild(message);
    }
    gamesGrid.appendChild(empty);
    updateActionUi();
    return;
  }

  games.forEach((game, index) => {
    gamesGrid.appendChild(buildGameTile(game, index));
  });
  updateActionUi();
}

function closeGamesContextMenu() {
  state.contextMenuGameId = '';
  if (gamesContextMenu) gamesContextMenu.hidden = true;
}

function isEraseConfirmOpen() {
  return !!(eraseConfirmBackdrop && !eraseConfirmBackdrop.hidden);
}

function closeEraseConfirm(confirmed = false) {
  if (!eraseConfirmBackdrop || eraseConfirmBackdrop.hidden) return;
  const resolver = state.eraseConfirmResolver;
  const previousFocus = state.eraseConfirmPreviousFocus;
  state.eraseConfirmResolver = null;
  state.eraseConfirmPreviousFocus = null;
  eraseConfirmBackdrop.hidden = true;
  if (eraseConfirmGameName) eraseConfirmGameName.textContent = '';
  document.body.classList.remove('erase-note-open');
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch (error) {
      previousFocus.focus();
    }
  }
  if (typeof resolver === 'function') resolver(confirmed);
}

function openEraseConfirm(gameId) {
  const game = getGameById(gameId);
  if (!game) return Promise.resolve(false);
  if (!eraseConfirmBackdrop || !eraseConfirmGameName || !eraseConfirmYesBtn || !eraseConfirmNoBtn) {
    return Promise.resolve(window.confirm(`Are you sure you want to erase ${game.name || 'this game'}?`));
  }
  if (state.eraseConfirmResolver) closeEraseConfirm(false);
  closeGamesContextMenu();
  state.eraseConfirmPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  eraseConfirmGameName.textContent = game.name || 'this game';
  eraseConfirmBackdrop.hidden = false;
  document.body.classList.add('erase-note-open');
  requestAnimationFrame(() => {
    try {
      eraseConfirmNoBtn.focus({ preventScroll: true });
    } catch (error) {
      eraseConfirmNoBtn.focus();
    }
  });
  return new Promise((resolve) => {
    state.eraseConfirmResolver = resolve;
  });
}

function openGamesContextMenu(clientX, clientY, gameId = '') {
  if (!gamesContextMenu) return;
  state.contextMenuGameId = String(gameId || '').trim();
  const targetGameId = state.contextMenuGameId || state.selectedGameId;
  const canMutate = !state.readOnly;
  if (gamesMenuNewBtn) gamesMenuNewBtn.disabled = false;
  if (gamesMenuEditBtn) gamesMenuEditBtn.disabled = false;
  if (gamesMenuRenameBtn) gamesMenuRenameBtn.disabled = !targetGameId || !canMutate;
  if (gamesMenuDuplicateBtn) gamesMenuDuplicateBtn.disabled = !targetGameId || !canMutate;
  if (gamesMenuDeleteBtn) gamesMenuDeleteBtn.disabled = !targetGameId || !canMutate;
  gamesContextMenu.hidden = false;
  gamesContextMenu.style.left = '0px';
  gamesContextMenu.style.top = '0px';
  const margin = 10;
  const width = gamesContextMenu.offsetWidth || 180;
  const height = gamesContextMenu.offsetHeight || 176;
  const left = Math.min(clientX, window.innerWidth - width - margin);
  const top = Math.min(clientY, window.innerHeight - height - margin);
  gamesContextMenu.style.left = Math.max(margin, left) + 'px';
  gamesContextMenu.style.top = Math.max(margin, top) + 'px';
}

function buildEditorUrl(options = {}) {
  const target = new URL(EDITOR_PAGE_ROUTE, location.href);
  if (options.newGame) {
    target.searchParams.set('new', '1');
  } else if (options.gameId) {
    target.searchParams.set('gameId', options.gameId);
  }
  return target.toString();
}

function goToEditor(options = {}) {
  persistStoreLocally();
  try {
    if (options.gameId) localStorage.setItem(LOCAL_OPEN_GAME_KEY, options.gameId);
    else localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
  } catch (error) {
  }
  location.href = buildEditorUrl(options);
}

function startNewGame() {
  closeGamesContextMenu();
  goToEditor({ newGame: true });
}

function editSelectedGame(gameId = state.selectedGameId) {
  const selectedId = String(gameId || '').trim();
  closeGamesContextMenu();
  if (!selectedId) {
    goToEditor();
    return;
  }
  goToEditor({ gameId: selectedId });
}

async function renameSelectedGame(gameId = state.selectedGameId) {
  if (state.readOnly) return;
  const targetId = String(gameId || '').trim();
  if (!targetId) return;
  const sourceGame = getGameById(targetId);
  if (!sourceGame) return;
  closeGamesContextMenu();

  const rawName = window.prompt('Rename game', sourceGame.name || 'Untitled Game');
  if (rawName == null) return;

  const nextName = String(rawName || '').trim() || 'Untitled Game';
  if (nextName === sourceGame.name) return;
  const nextId = buildUniqueGameIdFromName(nextName, sourceGame.id);

  const timestamp = new Date().toISOString();
  const renamedGame = normalizeGameEntry({
    ...cloneObj(sourceGame),
    id: nextId,
    name: nextName,
    updatedAt: timestamp
  }, state.store.games.findIndex((game) => game && game.id === sourceGame.id));
  const titleNode = getEditableGameTitleNode(renamedGame);
  if (titleNode) titleNode.title = nextName;

  const result = await renameGameInSupabase(sourceGame.id, renamedGame);
  if (!result.serverSaved) {
    state.supabaseStatusMessage = showSupabaseError(result.error, 'Could not rename this game in Supabase.');
    renderGames();
    return;
  }

  state.selectedGameId = renamedGame.id;
  persistStoreLocally();
  await loadStore({ preferredSelectedGameId: renamedGame.id });
}

async function duplicateSelectedGame(gameId = state.selectedGameId) {
  if (state.readOnly) return;
  const sourceGame = state.store.games.find((game) => game && game.id === gameId);
  if (!sourceGame) return;
  closeGamesContextMenu();

  const timestamp = new Date().toISOString();
  const duplicate = normalizeGameEntry({
    ...cloneObj(sourceGame),
    id: makeGameId(),
    name: buildDuplicateGameName(sourceGame.name || 'Untitled Game'),
    createdAt: timestamp,
    updatedAt: timestamp
  }, state.store.games.length);

  const result = await syncGameToSupabase(duplicate);
  if (!result.serverSaved) {
    state.supabaseStatusMessage = showSupabaseError(result.error, 'Could not duplicate this game in Supabase.');
    renderGames();
    return;
  }

  state.selectedGameId = duplicate.id;
  persistStoreLocally();
  await loadStore({ preferredSelectedGameId: duplicate.id });
}

async function deleteSelectedGame(gameId = state.selectedGameId) {
  if (state.readOnly) return;
  const targetId = String(gameId || '').trim();
  if (!targetId) return;
  const game = getGameById(targetId);
  if (!game) return;
  const confirmed = await openEraseConfirm(targetId);
  if (!confirmed) return;

  const preferredSelectedGameId = state.selectedGameId === targetId ? '' : state.selectedGameId;
  const result = await deleteGameFromSupabase(targetId);
  if (!result.serverSaved) {
    state.supabaseStatusMessage = showSupabaseError(result.error, 'Could not delete this game from Supabase.');
    renderGames();
    return;
  }

  state.selectedGameId = preferredSelectedGameId;
  persistStoreLocally();
  await loadStore({ preferredSelectedGameId });
}

async function loadStore(options = {}) {
  const preferredSelectedGameId = typeof options.preferredSelectedGameId === 'string'
    ? options.preferredSelectedGameId.trim()
    : '';
  const forcedStatusMessage = typeof options.statusMessage === 'string'
    ? options.statusMessage
    : '';
  const supabaseResult = await loadStoreFromSupabase();

  if (!supabaseResult.store) {
    state.store = cloneObj(EMPTY_STORE);
    state.readOnly = true;
    state.supabaseStatusMessage = forcedStatusMessage || getErrorMessage(supabaseResult.error, 'Could not load the Supabase games table.');
    state.selectedGameId = '';
    renderGames();
    return;
  }

  state.store = supabaseResult.store;
  state.readOnly = false;
  state.supabaseStatusMessage = forcedStatusMessage || '';

  let selectedId = preferredSelectedGameId;
  if (!selectedId) {
    try {
      selectedId = String(localStorage.getItem(LOCAL_OPEN_GAME_KEY) || '').trim();
    } catch (error) {
    }
  }
  if (!selectedId || !state.store.games.some((game) => game && game.id === selectedId)) {
    const firstGame = getSortedGames()[0] || null;
    selectedId = firstGame ? firstGame.id : '';
  }
  state.selectedGameId = selectedId;
  persistStoreLocally();
  renderGames();
}

if (newGameLink) {
  newGameLink.addEventListener('click', (event) => {
    if (newGameLink.classList.contains('is-disabled')) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    startNewGame();
  });
}

if (editGameLink) {
  editGameLink.addEventListener('click', (event) => {
    if (editGameLink.classList.contains('is-disabled')) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    editSelectedGame();
  });
}

if (renameGameLink) {
  renameGameLink.addEventListener('click', (event) => {
    event.preventDefault();
    if (renameGameLink.classList.contains('is-disabled')) return;
    renameSelectedGame();
  });
}

if (duplicateGameLink) {
  duplicateGameLink.addEventListener('click', (event) => {
    event.preventDefault();
    if (duplicateGameLink.classList.contains('is-disabled')) return;
    duplicateSelectedGame();
  });
}

if (deleteGameBtn) deleteGameBtn.addEventListener('click', () => deleteSelectedGame());
if (gamesMenuNewBtn) gamesMenuNewBtn.addEventListener('click', startNewGame);
if (gamesMenuEditBtn) gamesMenuEditBtn.addEventListener('click', () => editSelectedGame(state.contextMenuGameId || state.selectedGameId));
if (gamesMenuRenameBtn) gamesMenuRenameBtn.addEventListener('click', () => renameSelectedGame(state.contextMenuGameId || state.selectedGameId));
if (gamesMenuDuplicateBtn) gamesMenuDuplicateBtn.addEventListener('click', () => duplicateSelectedGame(state.contextMenuGameId || state.selectedGameId));
if (gamesMenuDeleteBtn) gamesMenuDeleteBtn.addEventListener('click', () => deleteSelectedGame(state.contextMenuGameId || state.selectedGameId));

document.addEventListener('click', (event) => {
  if (gamesContextMenu && !gamesContextMenu.hidden && !gamesContextMenu.contains(event.target)) {
    closeGamesContextMenu();
  }
});

if (eraseConfirmBackdrop) {
  eraseConfirmBackdrop.addEventListener('click', (event) => {
    if (event.target === eraseConfirmBackdrop) closeEraseConfirm(false);
  });
}

if (eraseConfirmYesBtn) {
  eraseConfirmYesBtn.addEventListener('click', () => closeEraseConfirm(true));
}

if (eraseConfirmNoBtn) {
  eraseConfirmNoBtn.addEventListener('click', () => closeEraseConfirm(false));
}

document.addEventListener('contextmenu', (event) => {
  if (isEraseConfirmOpen()) return;
  if (gamesContextMenu && gamesContextMenu.contains(event.target)) return;
  const tile = event.target instanceof Element ? event.target.closest('.game-tile') : null;
  if (!tile) {
    event.preventDefault();
    openGamesContextMenu(event.clientX, event.clientY);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (isEraseConfirmOpen()) {
      event.preventDefault();
      closeEraseConfirm(false);
      return;
    }
    closeGamesContextMenu();
    return;
  }
  if (isEraseConfirmOpen()) return;
  if (event.key === 'Enter' && getSelectedGame()) {
    event.preventDefault();
    editSelectedGame();
    return;
  }
  if (state.readOnly) return;
  if ((event.key === 'Delete' || event.key === 'Backspace') && getSelectedGame()) {
    const targetTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (targetTag === 'input' || targetTag === 'textarea' || event.target.isContentEditable) return;
    event.preventDefault();
    deleteSelectedGame();
  }
});

loadStore();
