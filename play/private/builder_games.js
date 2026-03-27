const STORE_FILE_NAME = 'games_phoneanalogy.json';
const STORE_API_ROUTE = '/games-phoneanalogy';
const LOCAL_STORE_KEY = 'tgb-games-phoneanalogy';
const LOCAL_OPEN_GAME_KEY = 'tgb-games-phoneanalogy-open';
const STORE_COMMENT = 'File: games_phoneanalogy.json | Purpose: phone-analogy graph-builder data written by TGB Builder for later game-engine use.';
const PERSISTENCE_DB_NAME = 'tgb-builder-persistence';
const PERSISTENCE_DB_VERSION = 1;
const PERSISTENCE_STORE_NAME = 'handles';
const STORE_FILE_HANDLE_KEY = 'games-phoneanalogy-handle';
const STORE_FILE_TYPES = [{
  description: 'TGB Game Library',
  accept: {
    'application/json': ['.json']
  }
}];

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

const API = /^(http|https):$/.test(location.protocol) ? location.origin : null;
const LOCAL_NODE_API = 'http://localhost:3000';
const EDITOR_PAGE_ROUTE = 'builder_phoneanalogy.html';
const BIC_BLUE_INK = '#2f5cc2';

const gamesGrid = document.getElementById('gamesGrid');
const newGameLink = document.getElementById('newGameLink');
const editGameLink = document.getElementById('editGameLink');
const duplicateGameLink = document.getElementById('duplicateGameLink');
const deleteGameBtn = document.getElementById('deleteGameBtn');
const gamesContextMenu = document.getElementById('gamesContextMenu');
const gamesMenuNewBtn = document.getElementById('gamesMenuNewBtn');
const gamesMenuEditBtn = document.getElementById('gamesMenuEditBtn');
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
  needsLocalStoreImport: false,
  localStoreImportError: '',
  eraseConfirmResolver: null,
  eraseConfirmPreviousFocus: null
};

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

function isLocalHostname(hostname = location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isHostedHttpView() {
  return /^(http|https):$/.test(location.protocol) && !isLocalHostname();
}

function isFileProtocolView() {
  return location.protocol === 'file:';
}

function getApiBaseCandidates() {
  const bases = [];
  if (API) bases.push(API);
  if (!bases.includes(LOCAL_NODE_API) && (!API || isLocalHostname())) {
    bases.push(LOCAL_NODE_API);
  }
  return bases;
}

function supportsBrowserFileSave() {
  return !!(window.isSecureContext && typeof window.showSaveFilePicker === 'function');
}

function supportsBrowserFileOpen() {
  return !!(window.isSecureContext && typeof window.showOpenFilePicker === 'function');
}

function getSerializedStoreText(store = state.store) {
  return JSON.stringify(normalizeStore(store), null, 2) + '\n';
}

let persistenceDbPromise = null;

function openPersistenceDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (persistenceDbPromise) return persistenceDbPromise;

  persistenceDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(PERSISTENCE_DB_NAME, PERSISTENCE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PERSISTENCE_STORE_NAME)) {
          db.createObjectStore(PERSISTENCE_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });

  return persistenceDbPromise;
}

async function readPersistenceValue(key) {
  const db = await openPersistenceDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PERSISTENCE_STORE_NAME, 'readonly');
      const request = tx.objectStore(PERSISTENCE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });
}

async function writePersistenceValue(key, value) {
  const db = await openPersistenceDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PERSISTENCE_STORE_NAME, 'readwrite');
      tx.objectStore(PERSISTENCE_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (error) {
      resolve(false);
    }
  });
}

async function deletePersistenceValue(key) {
  const db = await openPersistenceDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PERSISTENCE_STORE_NAME, 'readwrite');
      tx.objectStore(PERSISTENCE_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (error) {
      resolve(false);
    }
  });
}

async function readRememberedStoreFileHandle() {
  return readPersistenceValue(STORE_FILE_HANDLE_KEY);
}

async function rememberStoreFileHandle(handle) {
  if (!handle) return false;
  return writePersistenceValue(STORE_FILE_HANDLE_KEY, handle);
}

async function forgetStoreFileHandle() {
  return deletePersistenceValue(STORE_FILE_HANDLE_KEY);
}

async function queryFileHandlePermission(handle, mode = 'read') {
  if (!handle || typeof handle.queryPermission !== 'function') return 'prompt';
  try {
    return await handle.queryPermission({ mode });
  } catch (error) {
    return 'prompt';
  }
}

async function ensureFileHandlePermission(handle, mode = 'readwrite', options = {}) {
  if (!handle) return false;
  const allowPrompt = options.allowPrompt !== false;
  let permission = await queryFileHandlePermission(handle, mode);
  if (permission === 'granted') return true;
  if (!allowPrompt || typeof handle.requestPermission !== 'function') return false;

  try {
    permission = await handle.requestPermission({ mode });
    return permission === 'granted';
  } catch (error) {
    return false;
  }
}

async function getWritableStoreFileHandle(options = {}) {
  const allowPrompt = options.allowPrompt !== false;
  const rememberedHandle = await readRememberedStoreFileHandle();
  if (rememberedHandle && await ensureFileHandlePermission(rememberedHandle, 'readwrite', { allowPrompt })) {
    return rememberedHandle;
  }

  if (!allowPrompt || !supportsBrowserFileSave()) return null;

  const handle = await window.showSaveFilePicker({
    suggestedName: STORE_FILE_NAME,
    types: STORE_FILE_TYPES
  });
  if (!handle) return null;
  await rememberStoreFileHandle(handle);
  return handle;
}

async function readStoreFromRememberedFile() {
  if (!supportsBrowserFileSave()) return null;

  try {
    const handle = await readRememberedStoreFileHandle();
    if (!handle) return null;
    const permission = await queryFileHandlePermission(handle, 'read');
    if (permission !== 'granted') return null;

    const file = await handle.getFile();
    const raw = JSON.parse(await file.text());
    return normalizeIncomingStorePayload(raw);
  } catch (error) {
    if (error && (error.name === 'NotFoundError' || error.name === 'DataError')) {
      await forgetStoreFileHandle();
    }
    return null;
  }
}

async function readStoreFileText(file) {
  if (!file) return '';
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsText(file);
    } catch (error) {
      reject(error);
    }
  });
}

function pickStoreFileViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(file);
    }, { once: true });

    input.click();
  });
}

async function promptForLocalStoreImport() {
  try {
    let rawText = '';

    if (supportsBrowserFileOpen()) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: STORE_FILE_TYPES
        });
        if (handle) {
          const permissionGranted = await ensureFileHandlePermission(handle, 'read', { allowPrompt: true });
          if (!permissionGranted) {
            throw new Error('Permission to read the JSON file was denied.');
          }
          const file = await handle.getFile();
          rawText = await readStoreFileText(file);
          await rememberStoreFileHandle(handle);
        }
      } catch (error) {
        if (error && error.name === 'AbortError') return false;
        if (!rawText) {
          const file = await pickStoreFileViaInput();
          if (!file) return false;
          rawText = await readStoreFileText(file);
        }
      }
    } else {
      const file = await pickStoreFileViaInput();
      if (!file) return false;
      rawText = await readStoreFileText(file);
    }

    const parsed = JSON.parse(rawText);
    const importedStore = normalizeIncomingStorePayload(parsed);
    if (!importedStore) {
      throw new Error('That file was not a valid TGB game library JSON.');
    }

    state.store = importedStore;
    state.readOnly = false;
    state.needsLocalStoreImport = false;
    state.localStoreImportError = '';
    persistStoreLocally();

    let selectedId = '';
    try {
      selectedId = String(localStorage.getItem(LOCAL_OPEN_GAME_KEY) || '').trim();
    } catch (error) {
    }
    if (!selectedId || !state.store.games.some((game) => game && game.id === selectedId)) {
      const firstGame = getSortedGames()[0] || null;
      selectedId = firstGame ? firstGame.id : '';
    }
    state.selectedGameId = selectedId;
    renderGames();
    return true;
  } catch (error) {
    state.needsLocalStoreImport = true;
    state.localStoreImportError = error && error.message ? error.message : 'Could not open the JSON file.';
    renderGames();
    return false;
  }
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

function persistStoreLocally() {
  try {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state.store));
    if (state.selectedGameId) {
      localStorage.setItem(LOCAL_OPEN_GAME_KEY, state.selectedGameId);
    } else {
      localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
    }
  } catch (error) {
  }
}

async function syncStoreToServer() {
  state.store.updatedAt = new Date().toISOString();
  try {
    let lastError = null;
    for (const apiBase of getApiBaseCandidates()) {
      try {
        const response = await fetch(apiBase + STORE_API_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizeStore(state.store))
        });
        if (!response.ok) {
          throw new Error(await response.text() || 'Store sync failed');
        }
        return { serverSaved: true, localOnly: false };
      } catch (error) {
        lastError = error;
      }
    }
    return { serverSaved: false, localOnly: true, error: lastError };
  } catch (error) {
    return { serverSaved: false, localOnly: true, error };
  }
}

async function syncStoreToBrowserFile(options = {}) {
  if (!supportsBrowserFileSave()) return { fileSaved: false, supported: false };

  try {
    const handle = await getWritableStoreFileHandle({ allowPrompt: options.allowPrompt !== false });
    if (!handle) return { fileSaved: false, supported: true };

    const writable = await handle.createWritable();
    await writable.write(getSerializedStoreText());
    await writable.close();
    await rememberStoreFileHandle(handle);
    return { fileSaved: true, localOnly: false };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { fileSaved: false, supported: true, cancelled: true, error };
    }
    return { fileSaved: false, supported: true, error };
  }
}

function syncStoreToDownload() {
  try {
    const blob = new Blob([getSerializedStoreText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = STORE_FILE_NAME;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { downloaded: true, localOnly: false };
  } catch (error) {
    return { downloaded: false, localOnly: true, error };
  }
}

async function syncStoreToBestAvailableTarget(options = {}) {
  const serverResult = await syncStoreToServer();
  if (serverResult && serverResult.serverSaved) return serverResult;

  const fileResult = await syncStoreToBrowserFile({ allowPrompt: options.allowInteractiveFallback !== false });
  if (fileResult && fileResult.fileSaved) return fileResult;
  if (fileResult && fileResult.cancelled) return { localOnly: true, cancelled: true, error: fileResult.error };

  if (options.allowInteractiveFallback) {
    const downloadResult = syncStoreToDownload();
    if (downloadResult && downloadResult.downloaded) return downloadResult;
  }

  return { localOnly: true, error: (fileResult && fileResult.error) || (serverResult && serverResult.error) || null };
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
  if (raw._comment === STORE_COMMENT && Array.isArray(raw.games)) return normalizeStore(raw);
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
  setActionLinkState(newGameLink, canMutate, buildEditorUrl({ newGame: true }));
  setActionLinkState(editGameLink, hasSelection && canMutate, selectedGame ? buildEditorUrl({ gameId: selectedGame.id }) : '');
  setActionLinkState(duplicateGameLink, hasSelection && canMutate, '#duplicate');
  if (deleteGameBtn) deleteGameBtn.disabled = !hasSelection || !canMutate;
  if (gamesMenuNewBtn) gamesMenuNewBtn.disabled = !canMutate;
  if (gamesMenuEditBtn) gamesMenuEditBtn.disabled = !hasSelection || !canMutate;
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
    if (state.readOnly) return;
    editSelectedGame(game.id);
  });
  button.addEventListener('contextmenu', (event) => {
    if (state.readOnly) return;
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

  if (!games.length) {
    const empty = document.createElement('div');
    empty.className = 'games-empty';
    if (state.needsLocalStoreImport) {
      const message = document.createElement('p');
      message.className = 'games-empty-copy';
      message.textContent = state.localStoreImportError || 'Open games_phoneanalogy.json to load your games without a server.';
      empty.appendChild(message);

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'games-empty-open-btn';
      openBtn.textContent = 'Open JSON';
      openBtn.addEventListener('click', () => {
        promptForLocalStoreImport();
      });
      empty.appendChild(openBtn);
    } else {
      empty.textContent = 'No games yet. Choose New to start one.';
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
  if (!gamesContextMenu || state.readOnly) return;
  state.contextMenuGameId = String(gameId || '').trim();
  if (gamesMenuNewBtn) gamesMenuNewBtn.disabled = false;
  if (gamesMenuEditBtn) gamesMenuEditBtn.disabled = !state.contextMenuGameId;
  if (gamesMenuDuplicateBtn) gamesMenuDuplicateBtn.disabled = !state.contextMenuGameId;
  if (gamesMenuDeleteBtn) gamesMenuDeleteBtn.disabled = !state.contextMenuGameId;
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

async function saveStoreBestEffort(options = {}) {
  persistStoreLocally();
  try {
    return await syncStoreToBestAvailableTarget({ allowInteractiveFallback: !!options.allowInteractiveFallback });
  } catch (error) {
    return { localOnly: true, error };
  }
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
  if (state.readOnly) return;
  persistStoreLocally();
  try {
    if (options.gameId) localStorage.setItem(LOCAL_OPEN_GAME_KEY, options.gameId);
    else localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
  } catch (error) {
  }
  location.href = buildEditorUrl(options);
}

function startNewGame() {
  if (state.readOnly) return;
  closeGamesContextMenu();
  goToEditor({ newGame: true });
}

function editSelectedGame(gameId = state.selectedGameId) {
  if (state.readOnly) return;
  const selectedId = String(gameId || '').trim();
  if (!selectedId) return;
  closeGamesContextMenu();
  goToEditor({ gameId: selectedId });
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

  state.store.games.push(duplicate);
  state.store.updatedAt = timestamp;
  state.selectedGameId = duplicate.id;
  renderGames();
  await saveStoreBestEffort();
}

async function deleteSelectedGame(gameId = state.selectedGameId) {
  if (state.readOnly) return;
  const targetId = String(gameId || '').trim();
  if (!targetId) return;
  const game = getGameById(targetId);
  if (!game) return;
  const confirmed = await openEraseConfirm(targetId);
  if (!confirmed) return;

  const index = state.store.games.findIndex((game) => game && game.id === targetId);
  if (index < 0) return;

  state.store.games.splice(index, 1);
  state.store.updatedAt = new Date().toISOString();
  if (state.selectedGameId === targetId) {
    const nextGame = getSortedGames()[0] || null;
    state.selectedGameId = nextGame ? nextGame.id : '';
  }
  try {
    if (state.selectedGameId) localStorage.setItem(LOCAL_OPEN_GAME_KEY, state.selectedGameId);
    else localStorage.removeItem(LOCAL_OPEN_GAME_KEY);
  } catch (error) {
  }
  renderGames();
  await saveStoreBestEffort();
}

async function loadStore() {
  let apiStore = null;
  let bundledStore = null;
  const hostedHttpView = isHostedHttpView();

  try {
    let response = null;
    for (const apiBase of getApiBaseCandidates()) {
      try {
        response = await fetch(apiBase + STORE_API_ROUTE, { cache: 'no-store' });
        if (response.ok) break;
      } catch (error) {
      }
    }
    if (response && response.ok) {
      apiStore = normalizeIncomingStorePayload(await response.json());
    }
  } catch (error) {
  }

  const fileStore = await readStoreFromRememberedFile();
  const localStore = readLocalStoreSnapshot();
  try {
    if (!apiStore && !isFileProtocolView()) {
      const bundledResponse = await fetch('../data/' + STORE_FILE_NAME, { cache: 'no-store' });
      if (bundledResponse.ok) {
        bundledStore = normalizeIncomingStorePayload(await bundledResponse.json());
      }
    }
  } catch (error) {
  }

  if (hostedHttpView) {
    state.store = apiStore || bundledStore || fileStore || localStore || cloneObj(EMPTY_STORE);
  } else {
    state.store = pickPreferredStoreCandidate([apiStore, fileStore, localStore, bundledStore]) || cloneObj(EMPTY_STORE);
  }
  state.readOnly = hostedHttpView && !apiStore;
  state.needsLocalStoreImport = isFileProtocolView() && !apiStore && !fileStore && !localStore && !bundledStore;
  state.localStoreImportError = '';

  let selectedId = '';
  try {
    selectedId = String(localStorage.getItem(LOCAL_OPEN_GAME_KEY) || '').trim();
  } catch (error) {
  }
  if (!selectedId || !state.store.games.some((game) => game && game.id === selectedId)) {
    const firstGame = getSortedGames()[0] || null;
    selectedId = firstGame ? firstGame.id : '';
  }
  state.selectedGameId = selectedId;
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
  if (state.readOnly) return;
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
  if (state.readOnly) return;
  if (event.key === 'Enter' && getSelectedGame()) {
    event.preventDefault();
    editSelectedGame();
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && getSelectedGame()) {
    const targetTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (targetTag === 'input' || targetTag === 'textarea' || event.target.isContentEditable) return;
    event.preventDefault();
    deleteSelectedGame();
  }
});

loadStore();
