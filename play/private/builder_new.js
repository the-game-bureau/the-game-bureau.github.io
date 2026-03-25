// TGB Builder writes JSON data that is read later by the game engine.
const TYPE_CONFIG = {
  game: {
    width: 108,
    height: 108,
    kicker: 'Game',
    title: 'Untitled Game',
    body: 'A guided SMS adventure through the city.',
    code: 'GM'
  },
  stop: {
    width: 108,
    height: 108,
    kicker: 'Stop',
    title: 'Stop Name',
    body: '',
    code: 'ST'
  },
  bubble: {
    width: 108,
    height: 108,
    kicker: 'GUIDE',
    title: '',
    body: '',
    code: 'BB'
  },
  reply: {
    width: 108,
    height: 108,
    kicker: 'PLAYER',
    title: '',
    body: '',
    code: 'RP'
  },
};
const NODE_ID_PREFIX = {
  game: 'gm',
  stop: 'st',
  bubble: 'gd',
  reply: 'pl'
};
const NODE_TYPE_BY_PREFIX = Object.fromEntries(
  Object.entries(NODE_ID_PREFIX).map(([type, prefix]) => [prefix, type])
);

const ALL_TAGS = ['Mystery', 'Puzzle', 'SMS', 'Walking Tour', 'Sports', 'History', 'Food', 'Adventure', 'Family', 'Conspiracy', 'Trivia', 'Horror', 'Romance', 'Comedy', 'Music', 'Culture', 'Night Life', 'City Tour', 'Scavenger Hunt', 'New Orleans'];

const STORE_COMMENT = 'File: games_new.json | Purpose: experimental graph-builder data written by TGB Builder for later game-engine use.';

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

const API = /^(http|https):$/.test(location.protocol) ? location.origin : null;
const LOCAL_NODE_API = 'http://localhost:3000';
const PLAY_PREVIEW_KEY = 'tgb-play-current-game';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const PAPER_BASE_WIDTH = 1224;
const PAPER_ASPECT_RATIO = 8.5 / 11;
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
const PIECE_TAB_DEPTH = 18;
const PIECE_CORNER = 4;
const PIECE_NECK_HALF = 9;
const PIECE_LOBE_RADIUS = 10;

function isLocalHostname(hostname = location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function getApiBaseCandidates() {
  const bases = [];
  if (API) bases.push(API);
  if (!bases.includes(LOCAL_NODE_API) && (!API || isLocalHostname())) bases.push(LOCAL_NODE_API);
  return bases;
}

function getGameDataFetchUrls() {
  const urls = [];
  getApiBaseCandidates().forEach((apiBase) => {
    urls.push(apiBase + '/games-new');
  });
  urls.push('../data/games_new.json');
  getApiBaseCandidates().forEach((apiBase) => {
    urls.push(apiBase + '/games');
  });
  urls.push('../data/games.json');
  return [...new Set(urls)];
}

const viewport = document.getElementById('viewport');
const boardStage = document.getElementById('boardStage');
const board = document.getElementById('board');
const linkLayer = document.getElementById('linkLayer');
const nodeLayer = document.getElementById('nodeLayer');
const inspector = document.getElementById('inspector');
const inspectorWindowBar = document.getElementById('inspectorWindowBar');
const inspectorWindowTitle = document.getElementById('inspectorWindowTitle');
const inspectorToggleBtn = document.getElementById('inspectorToggleBtn');
const inspRouteBadge = document.getElementById('inspRouteBadge');
const inspectorStack = document.getElementById('inspectorStack');
const stencilBar = document.getElementById('stencilBar');
const headerPlayGameBtn = document.getElementById('headerPlayGameBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomValue = document.getElementById('zoomValue');
const objectCard = document.getElementById('objectCard');
const inspectorContent = document.getElementById('inspectorContent');
const behaviorCard = document.getElementById('behaviorCard');
const inspectorCopy = document.getElementById('inspectorCopy');
const titleField = document.getElementById('titleField');
const stopNameField = document.getElementById('stopNameField');
const taglineField = document.getElementById('taglineField');
const guideNameField = document.getElementById('guideNameField');
const priceField = document.getElementById('priceField');
const tagsField = document.getElementById('tagsField');
const descriptionField = document.getElementById('descriptionField');
const ifThenField = document.getElementById('ifThenField');
const nodeTitleLabel = document.getElementById('nodeTitleLabel');
const nodeTitleInput = document.getElementById('nodeTitleInput');
const stopNameInput = document.getElementById('stopNameInput');
const nodeTaglineInput = document.getElementById('nodeTaglineInput');
const nodeGuideNameInput = document.getElementById('nodeGuideNameInput');
const nodePriceInput = document.getElementById('nodePriceInput');
const nodeTagPicker = document.getElementById('nodeTagPicker');
const nodeTagNewInput = document.getElementById('nodeTagNewInput');
const nodeTagAddBtn = document.getElementById('nodeTagAddBtn');
const nodeBodyLabel = document.getElementById('nodeBodyLabel');
const nodeBodyInfo = document.getElementById('nodeBodyInfo');
const nodeBodyInput = document.getElementById('nodeBodyInput');
const nodeBodyAutocomplete = document.getElementById('nodeBodyAutocomplete');

const varNameField = document.getElementById('varNameField');
const varNameInput = document.getElementById('varNameInput');
const varValuesField = document.getElementById('varValuesField');
const varValueInputs = [1, 2, 3, 4].map((index) => document.getElementById('varValue' + index));
const varCorrectRadios = [0, 1, 2, 3].map((index) => document.getElementById('varCorrect' + index));
const openGameBtn = document.getElementById('openGameBtn');
const openGameDialog = document.getElementById('openGameDialog');
const openGameDialogSelect = document.getElementById('openGameDialogSelect');
const confirmOpenGameBtn = document.getElementById('confirmOpenGameBtn');
const cancelOpenGameBtn = document.getElementById('cancelOpenGameBtn');
const selectionId = document.getElementById('selectionId');
const deleteBtn = document.getElementById('deleteBtn');
const saveGameBtn = document.getElementById('saveGameBtn') || document.getElementById('playGameBtn');
const newBoardBtn = document.getElementById('newBoardBtn');
const refreshPageBtn = document.getElementById('refreshPageBtn');
const refreshDialog = document.getElementById('refreshDialog');
const saveRefreshBtn = document.getElementById('saveRefreshBtn');
const discardRefreshBtn = document.getElementById('discardRefreshBtn');
const nodeContextMenu = document.getElementById('nodeContextMenu');
const duplicateNodeBtn = document.getElementById('duplicateNodeBtn');
const deleteNodeMenuBtn = document.getElementById('deleteNodeMenuBtn');

const nodeEls = new Map();
let allTags = [...ALL_TAGS];
let refreshDialogReturnFocusEl = null;
let openGameDialogReturnFocusEl = null;
const variableAutocomplete = {
  open: false,
  items: [],
  activeIndex: 0,
  tokenStart: -1,
  tokenEnd: -1
};

const state = {
  store: cloneObj(EMPTY_STORE),
  doc: cloneObj(EMPTY_DOC),
  currentGameId: null,
  cleanSnapshot: null,
  contextMenuNodeId: null,
  contextMenuLinkId: null,
  skipBeforeUnload: false,
  selectedId: null,
  selectedLinkId: null,
  dragNode: null,
  rotateNode: null,
  dockTargetId: null,
  panCanvas: null,
  stencilDrag: null,
  connectDrag: null,
  inspectorDrag: null,
  inspectorCollapsed: false,
  inspectorPosition: null,
  hoverTargetId: null,
  suppressBackgroundClick: false,
  zoom: 1,
  nextNodeNumbers: createNodeIdCounters()
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

function getBoardBaseSize() {
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const minWidth = origin.x + (major * GRID_COLUMNS);
  const minHeight = origin.y + (major * GRID_ROWS);
  const rightmostEdge = state.doc.nodes.reduce((max, node) => Math.max(max, node.x + (node.width || 108)), 0);
  const nodesWidth = rightmostEdge > 0 ? rightmostEdge + major * 2 : 0;
  const width = Math.max(minWidth, PAPER_BASE_WIDTH, nodesWidth);
  const height = Math.max(minHeight, Math.round(PAPER_BASE_WIDTH * PAPER_ASPECT_RATIO));
  return {
    width,
    height
  };
}

function getPlacementGridColumns() {
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const width = board.clientWidth || getBoardBaseSize().width;
  return Math.max(1, Math.floor((width - origin.x) / major));
}

function getPlacementGridRows() {
  const major = getMajorGridSize();
  const origin = getPlacementGridOrigin();
  const height = board.clientHeight || getBoardBaseSize().height;
  return Math.max(1, Math.floor((height - origin.y) / major));
}

function getPlacementBounds(width, height) {
  const origin = getPlacementGridOrigin();
  const baseSize = getBoardBaseSize();
  const boardWidth = board.clientWidth || baseSize.width;
  const boardHeight = board.clientHeight || baseSize.height;
  return {
    minX: origin.x,
    minY: origin.y,
    maxX: Math.max(origin.x, boardWidth - width - BOARD_PADDING),
    maxY: Math.max(origin.y, boardHeight - height - BOARD_PADDING)
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
  return type === 'game' || type === 'stop';
}

function getDefaultNodeTitle(type) {
  return usesNodeTitle(type) ? TYPE_CONFIG[type].title : '';
}

function formatNodeId(id) {
  return String(id || '').trim().toUpperCase();
}

function getNodeMessagePreview(node) {
  if (!node || !isBubbleLikeType(node.type)) return '';
  if (node.type === 'reply') {
    const guessText = String(node.body || '').replace(/\s+/g, ' ').trim();
    if (guessText) {
      return guessText.length > 18
        ? guessText.slice(0, 18).trimEnd() + '...'
        : guessText;
    }
    const varName = normalizeVariableName(node.varName);
    if (varName) return varName;
    return 'Player reply';
  }
  const body = String(node.body || '').replace(/\s+/g, ' ').trim();
  if (!body) return '';
  return body.length > 18
    ? body.slice(0, 18).trimEnd() + '...'
    : body;
}

function normalizeVariableName(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/^%+\s*/, '')
    .replace(/\s*%+$/, '')
    .trim();
}

function isAnytimeReplyNode(node) {
  return !!node && node.type === 'reply' && !!node.anytime;
}

function isAnytimeGuideNode(node) {
  return !!node && node.type === 'bubble' && !!node.anytime;
}

function isAnytimeNode(node) {
  return isAnytimeReplyNode(node) || isAnytimeGuideNode(node);
}

function getAnytimePairId(node) {
  return isAnytimeNode(node)
    ? String(node.anytimePairId || '').trim()
    : '';
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
  let candidate = sanitizedBase + '_' + counter;
  while (usedNames.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = sanitizedBase + '_' + counter;
  }
  return candidate;
}

function buildBestGuessReplyVariableName(node, preferredSource = null) {
  const promptSource = findReplyPromptSourceNode(node, preferredSource);
  const baseName = promptSource ? guessVariableNameFromPrompt(promptSource.body) : '';
  return makeUniqueReplyVariableName(baseName || 'reply', node ? node.id : null);
}

function ensureReplyVarName(node, preferredSource = null) {
  if (!node || node.type !== 'reply') return;
  if (normalizeVariableName(node.varName)) return;
  node.varName = buildBestGuessReplyVariableName(node, preferredSource);
}

function getNodeDisplayTitle(node) {
  if (!node) return '';
  const title = usesNodeTitle(node.type)
    ? String(node.title || '').trim()
    : getNodeMessagePreview(node);
  return node.type === 'reply' ? title.toUpperCase() : title;
}

function getNodeKicker(node) {
  if (!node) return '';
  if (isAnytimeReplyNode(node)) return 'PLAYER ANYTIME';
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
  return 'game-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function makeAnytimePairId() {
  return 'anytime-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const point = boardPointFromClient(clientX, clientY);
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

function closeVariableAutocomplete() {
  variableAutocomplete.open = false;
  variableAutocomplete.items = [];
  variableAutocomplete.activeIndex = 0;
  variableAutocomplete.tokenStart = -1;
  variableAutocomplete.tokenEnd = -1;
  if (nodeBodyAutocomplete) {
    nodeBodyAutocomplete.hidden = true;
    nodeBodyAutocomplete.innerHTML = '';
  }
}

function renderVariableAutocomplete() {
  if (!nodeBodyAutocomplete || !variableAutocomplete.open || !variableAutocomplete.items.length) {
    closeVariableAutocomplete();
    return;
  }

  nodeBodyAutocomplete.innerHTML = '';
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
    nodeBodyAutocomplete.appendChild(button);
  });
  nodeBodyAutocomplete.hidden = false;
}

function getVariableAutocompleteContext() {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'bubble' || nodeBodyInput.disabled) return null;
  if (document.activeElement !== nodeBodyInput) return null;
  if (nodeBodyInput.selectionStart !== nodeBodyInput.selectionEnd) return null;

  const value = nodeBodyInput.value;
  const caretIndex = nodeBodyInput.selectionStart;
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
  const currentValue = nodeBodyInput.value;
  const nextValue = currentValue.slice(0, variableAutocomplete.tokenStart) + insertion + currentValue.slice(variableAutocomplete.tokenEnd);
  const caret = variableAutocomplete.tokenStart + insertion.length;

  node.body = nextValue;
  closeVariableAutocomplete();
  renderAll();
  nodeBodyInput.focus();
  nodeBodyInput.setSelectionRange(caret, caret);
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
  if (!inspector || inspector.hidden) return;
  if (!state.inspectorPosition) state.inspectorPosition = getDefaultInspectorPosition();
  state.inspectorPosition = clampInspectorPosition(state.inspectorPosition.x, state.inspectorPosition.y);
  inspector.style.left = state.inspectorPosition.x + 'px';
  inspector.style.top = state.inspectorPosition.y + 'px';
  inspector.style.right = 'auto';
}

function refreshInspectorWindowUi() {
  if (!inspector) return;
  inspector.classList.toggle('is-collapsed', state.inspectorCollapsed);
  if (inspectorWindowTitle) {
    const node = getNode(state.selectedId);
    const link = getLink(state.selectedLinkId);
    inspectorWindowTitle.textContent = node
      ? (getNodeKicker(node) || 'Piece')
      : link
        ? 'Connection'
        : 'Details';
  }
  if (inspectorToggleBtn) {
    inspectorToggleBtn.textContent = state.inspectorCollapsed ? 'Expand' : 'Collapse';
    inspectorToggleBtn.setAttribute('aria-expanded', state.inspectorCollapsed ? 'false' : 'true');
  }
  if (inspectorStack) inspectorStack.hidden = state.inspectorCollapsed;
  if (!inspector.hidden) {
    window.requestAnimationFrame(applyInspectorPosition);
  }
}

function toggleInspectorCollapsed(forceValue = null) {
  state.inspectorCollapsed = forceValue == null ? !state.inspectorCollapsed : !!forceValue;
  refreshInspectorWindowUi();
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
  const gameSlot = type === 'game' ? getGameHomeSlot() : null;
  const anytime = (type === 'reply' || type === 'bubble') && !!(raw && raw.anytime);
  const anytimePairId = anytime
    ? String(raw && (raw.anytimePairId || raw.pairId || '') || '').trim()
    : '';
  const rawBody = rawType === 'ask'
    ? getLegacyAskBubbleBody(raw)
    : raw && raw.body ? String(raw.body) : config.body;
  const replyVarName = type === 'reply' ? getLegacyReplyVarName(raw) : '';
  return {
    id: idOverride || makeId(type),
    type,
    x: gameSlot ? gameSlot.x : normalizeGridAnchoredValue(raw && raw.x, 'x'),
    y: gameSlot ? gameSlot.y : normalizeGridAnchoredValue(raw && raw.y, 'y'),
    width: config.width,
    height: config.height,
    title: usesNodeTitle(type) && raw && typeof raw.title === 'string' && raw.title.trim()
      ? String(raw.title)
      : getDefaultNodeTitle(type),
    tagline: raw && typeof raw.tagline === 'string' ? raw.tagline : '',
    guideName: raw && typeof raw.guideName === 'string' ? raw.guideName : '',
    price: raw && typeof raw.price === 'string' ? raw.price : '',
    tags: Array.isArray(raw && raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof (raw && raw.tag) === 'string'
        ? raw.tag.split(/[;,]+/).map((tag) => tag.trim()).filter(Boolean)
        : [],
    body: type === 'reply' && !normalizeVariableName(raw && raw.varName) && isVariableOnlyBody(rawBody)
      ? ''
      : rawBody,
    varName: replyVarName,
    anytime,
    anytimePairId,
    rotation: normalizeNodeRotation(raw && raw.rotation, type)
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
  return JSON.stringify({
    currentGameId: state.currentGameId || '',
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      title: node.title,
      tagline: node.tagline || '',
      guideName: node.guideName || '',
      price: node.price || '',
      tags: (node.tags || []).filter(Boolean),
      body: node.body || '',
      varName: node.varName || '',
      anytime: !!node.anytime,
      anytimePairId: node.anytimePairId || '',
      rotation: getNodeRotation(node)
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
  return !!node
    && node.type === 'game'
    && node.id === 'gm-01'
    && node.x === slot.x
    && node.y === slot.y
    && node.title === TYPE_CONFIG.game.title
    && (node.tagline || '') === 'Shall We Play A Game?'
    && (node.guideName || '') === 'Mission Control'
    && (node.price || '') === 'Free To Start / In App Purchases'
    && Array.isArray(node.tags)
    && node.tags.length === 0
    && (node.body || '') === TYPE_CONFIG.game.body;
}

function hasUnsavedChanges() {
  if (isPristineStarterDoc()) return false;
  return state.cleanSnapshot != null && getDocSnapshot() !== state.cleanSnapshot;
}

function updateActionUi() {
  if (saveGameBtn) saveGameBtn.disabled = false;
  if (headerPlayGameBtn) headerPlayGameBtn.disabled = false;
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

function isZoomInShortcut(event) {
  if (event.altKey) return false;
  if (event.ctrlKey || event.metaKey) return event.code === 'Equal';
  return event.code === 'Equal';
}

function isZoomOutShortcut(event) {
  if (event.altKey) return false;
  if (event.ctrlKey || event.metaKey) return event.code === 'Minus';
  return event.code === 'Minus';
}

function isZoomResetShortcut(event) {
  if (event.altKey) return false;
  if (event.ctrlKey || event.metaKey) return event.code === 'Digit0';
  return event.code === 'Digit0';
}

function setRefreshDialogBusy(isBusy) {
  if (saveRefreshBtn) saveRefreshBtn.disabled = isBusy;
  if (discardRefreshBtn) discardRefreshBtn.disabled = isBusy;
}

function openRefreshDialog() {
  if (!refreshDialog || refreshDialog.hidden === false) return;
  refreshDialogReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setRefreshDialogBusy(false);
  refreshDialog.hidden = false;
  if (saveRefreshBtn) saveRefreshBtn.focus();
}

function closeRefreshDialog() {
  if (!refreshDialog || refreshDialog.hidden) return;
  refreshDialog.hidden = true;
  setRefreshDialogBusy(false);
  if (refreshDialogReturnFocusEl && typeof refreshDialogReturnFocusEl.focus === 'function') {
    refreshDialogReturnFocusEl.focus();
  }
  refreshDialogReturnFocusEl = null;
}

function closeNodeContextMenu() {
  if (!nodeContextMenu || nodeContextMenu.hidden) return;
  nodeContextMenu.hidden = true;
  state.contextMenuNodeId = null;
  state.contextMenuLinkId = null;
}

function openNodeContextMenu(nodeId, clientX, clientY) {
  if (!nodeContextMenu) return;

  const node = getNode(nodeId);
  if (!node) return;

  state.contextMenuNodeId = nodeId;
  state.contextMenuLinkId = null;
  if (duplicateNodeBtn) duplicateNodeBtn.disabled = node.type === 'game';
  if (duplicateNodeBtn) duplicateNodeBtn.hidden = false;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.disabled = false;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.textContent = 'Delete';
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

function openLinkContextMenu(linkId, clientX, clientY) {
  if (!nodeContextMenu) return;

  const link = getLink(linkId);
  if (!link) return;
  const lockedPairLink = isLockedAnytimePairLink(link);

  state.contextMenuNodeId = null;
  state.contextMenuLinkId = linkId;
  if (duplicateNodeBtn) duplicateNodeBtn.hidden = true;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.disabled = lockedPairLink;
  if (deleteNodeMenuBtn) deleteNodeMenuBtn.textContent = 'Delete Connection';
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

function reloadPage(skipWarning = false) {
  if (skipWarning) {
    state.skipBeforeUnload = true;
    window.setTimeout(() => { state.skipBeforeUnload = false; }, 1500);
  }
  location.reload();
}

function attemptRefresh() {
  if (hasUnsavedChanges()) {
    openRefreshDialog();
    return;
  }

  reloadPage();
}

async function saveThenRefresh() {
  if (!refreshDialog || refreshDialog.hidden) return;
  setRefreshDialogBusy(true);
  await saveDoc();
  closeRefreshDialog();
  reloadPage(true);
}

function refreshWithoutSaving() {
  closeRefreshDialog();
  reloadPage(true);
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

function handleInsertAction(insertType) {
  if (insertType === 'reply-anytime') return addAnytimePairToVisibleCanvas();
  return addNodeToVisibleCanvas(insertType);
}

function normalizeSavedGame(raw, index) {
  const doc = normalizeDoc(raw);
  const createdAt = typeof (raw && raw.createdAt) === 'string' && raw.createdAt
    ? raw.createdAt
    : (typeof (raw && raw.updatedAt) === 'string' ? raw.updatedAt : doc.updatedAt);
  return {
    id: raw && raw.id ? String(raw.id) : 'game-' + (index + 1),
    name: raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : getDocName(doc),
    createdAt,
    updatedAt: typeof (raw && raw.updatedAt) === 'string' ? raw.updatedAt : doc.updatedAt,
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
  return {
    id: makeId(type),
    type,
    x: snap(x),
    y: snap(y),
    width: config.width,
    height: config.height,
    title: getDefaultNodeTitle(type),
    tagline: type === 'game' ? 'Shall We Play A Game?' : '',
    guideName: type === 'game' ? 'Mission Control' : '',
    price: type === 'game' ? 'Free To Start / In App Purchases' : '',
    tags: [],
    body: config.body,
    varName: '',
    anytime: false,
    anytimePairId: '',
    rotation: 0
  };
}

function syncAllTagsFromStore() {
  allTags = [...ALL_TAGS];

  const collectTags = (doc) => {
    doc.nodes.forEach((node) => {
      (node.tags || []).forEach((tag) => {
        if (tag && !allTags.includes(tag)) allTags.push(tag);
      });
    });
  };

  state.store.games.forEach((game) => {
    collectTags(game);
  });

  collectTags(state.doc);
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

function renderOpenGameDialogList() {
  const games = state.store.games || [];
  if (!openGameDialogSelect) return;
  openGameDialogSelect.innerHTML = '';

  if (!games.length) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'No saved games yet';
    emptyOption.disabled = true;
    openGameDialogSelect.appendChild(emptyOption);
  } else {
    const newestGames = [...games].sort(compareSavedGamesNewestFirst);
    const alphabeticalGames = [...games].sort(compareSavedGamesAlphabetical);
    const newestGame = newestGames[0];

    if (newestGame) {
      const newestGroup = document.createElement('optgroup');
      newestGroup.label = 'Newest';

      const newestOption = document.createElement('option');
      newestOption.value = newestGame.id;
      newestOption.textContent = formatSavedGameLabel(newestGame);
      newestGroup.appendChild(newestOption);
      openGameDialogSelect.appendChild(newestGroup);
    }

    const alphabeticalGroup = document.createElement('optgroup');
    alphabeticalGroup.label = 'A-Z';

    alphabeticalGames.forEach((game) => {
      const option = document.createElement('option');
      option.value = game.id;
      option.textContent = formatSavedGameLabel(game);
      alphabeticalGroup.appendChild(option);
    });

    openGameDialogSelect.appendChild(alphabeticalGroup);
  }

  openGameDialogSelect.disabled = !games.length;
  openGameDialogSelect.value = state.currentGameId && games.some((game) => game.id === state.currentGameId)
    ? state.currentGameId
    : (games[0] ? [...games].sort(compareSavedGamesNewestFirst)[0].id : '');
  if (confirmOpenGameBtn) confirmOpenGameBtn.disabled = !openGameDialogSelect.value;
}

function openSavedGame(gameId) {
  const game = state.store.games.find((entry) => entry.id === gameId);
  if (!game) return;

  state.currentGameId = game.id;
  state.doc = normalizeDoc(game);
  syncAllTagsFromStore();
  syncNextNodeNumbers();
  state.selectedLinkId = null;
  state.selectedId = state.doc.nodes.length ? state.doc.nodes[0].id : null;

  try {
    localStorage.setItem('tgb-games-new-open', game.id);
  } catch (error) {
  }

  rememberCleanSnapshot();
  renderOpenGameDialogList();
  renderAll();
}

function openOpenGameDialog() {
  if (!openGameDialog || openGameDialog.hidden === false) return;
  openGameDialogReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderOpenGameDialogList();
  openGameDialog.hidden = false;
  if (openGameDialogSelect && !openGameDialogSelect.disabled) openGameDialogSelect.focus();
  else if (cancelOpenGameBtn) cancelOpenGameBtn.focus();
}

function closeOpenGameDialog() {
  if (!openGameDialog || openGameDialog.hidden) return;
  openGameDialog.hidden = true;
  if (openGameDialogReturnFocusEl && typeof openGameDialogReturnFocusEl.focus === 'function') {
    openGameDialogReturnFocusEl.focus();
  }
  openGameDialogReturnFocusEl = null;
}

function openSelectedGameFromDialog() {
  if (!openGameDialogSelect || !openGameDialogSelect.value) return;
  const gameId = openGameDialogSelect.value;
  closeOpenGameDialog();
  openSavedGame(gameId);
}

function getRememberedOpenGameId() {
  try {
    return String(localStorage.getItem('tgb-games-new-open') || '').trim();
  } catch (error) {
    return '';
  }
}

function renderTagPicker(node) {
  const existingPills = [...nodeTagPicker.querySelectorAll('.tag-pill')];
  existingPills.forEach((pill) => pill.remove());

  const isGameNode = !!node && node.type === 'game';
  const selectedTags = new Set(isGameNode ? (node.tags || []) : []);

  allTags.forEach((tag) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tag-pill' + (selectedTags.has(tag) ? ' on' : '');
    pill.textContent = tag;
    pill.disabled = !isGameNode;
    pill.addEventListener('click', () => {
      if (!isGameNode) return;
      const nextTags = new Set(node.tags || []);
      if (nextTags.has(tag)) nextTags.delete(tag);
      else nextTags.add(tag);
      node.tags = [...nextTags];
      renderTagPicker(node);
    });
    nodeTagPicker.insertBefore(pill, nodeTagNewInput);
  });
}

function buildNodeBodyMarkup(node) {
  if (node.type === 'stop' || node.type === 'game' || isBubbleLikeType(node.type)) {
    return '';
  }

  return node.body
    ? `<div class="node-body">${escapeHtml(node.body)}</div>`
    : '';
}

function buildPuzzlePiecePath(node) {
  const w = node.width;
  const h = node.height;
  const r = PIECE_CORNER;
  const neck = PIECE_NECK_HALF;
  const lobe = PIECE_LOBE_RADIUS;
  const tab = PIECE_TAB_DEPTH;
  const midX = w / 2;
  const midY = h / 2;
  const y1 = midY - neck;
  const y2 = midY + neck;
  const x1 = midX - neck;
  const x2 = midX + neck;
  const hasLeftSocket = node.type !== 'game' && !isAnytimeReplyNode(node);
  const hasTopSocket = false;
  const hasRightTab = getNodeOutPorts(node).includes('out-right');
  const hasBottomTab = getNodeOutPorts(node).includes('out-bottom');

  const parts = [`M ${r} 0`];

  if (hasTopSocket) {
    parts.push(
      `H ${x1}`,
      `C ${x1} 4 ${midX - lobe} 7 ${midX - lobe} ${tab}`,
      `C ${midX - 4} ${tab + 2} ${midX + 4} ${tab + 2} ${midX + lobe} ${tab}`,
      `C ${midX + lobe} 7 ${x2} 4 ${x2} 0`
    );
  }

  parts.push(
    `H ${w - r}`,
    `Q ${w} 0 ${w} ${r}`
  );

  if (hasRightTab) {
    parts.push(
      `V ${y1}`,
      `C ${w + 4} ${y1} ${w + 7} ${midY - lobe} ${w + tab} ${midY - lobe}`,
      `C ${w + tab + 2} ${midY - 4} ${w + tab + 2} ${midY + 4} ${w + tab} ${midY + lobe}`,
      `C ${w + 7} ${midY + lobe} ${w + 4} ${y2} ${w} ${y2}`
    );
  }

  parts.push(
    `V ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`
  );

  if (hasBottomTab) {
    parts.push(
      `H ${x2}`,
      `C ${x2} ${h + 4} ${midX + lobe} ${h + 7} ${midX + lobe} ${h + tab}`,
      `C ${midX + 4} ${h + tab + 2} ${midX - 4} ${h + tab + 2} ${midX - lobe} ${h + tab}`,
      `C ${midX - lobe} ${h + 7} ${x1} ${h + 4} ${x1} ${h}`
    );
  }

  parts.push(
    `H ${r}`,
    `Q 0 ${h} 0 ${h - r}`
  );

  if (hasLeftSocket) {
    parts.push(
      `V ${y2}`,
      `C 4 ${y2} 7 ${midY + lobe} ${tab} ${midY + lobe}`,
      `C ${tab + 2} ${midY + 4} ${tab + 2} ${midY - 4} ${tab} ${midY - lobe}`,
      `C 7 ${midY - lobe} 4 ${y1} 0 ${y1}`
    );
  }

  parts.push(
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    'Z'
  );

  return parts.join(' ');
}

function buildNodePieceMarkup(node) {
  if (!TYPE_CONFIG[node.type]) return '';
  const width = node.width + PIECE_TAB_DEPTH + 4;
  const height = node.height + PIECE_TAB_DEPTH + 4;
  return `
    <svg class="node-piece" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <path class="node-piece-shape" d="${buildPuzzlePiecePath(node)}"></path>
    </svg>
  `;
}

function buildRotateHandleMarkup(node) {
  if (!node || node.type !== 'bubble') return '';
  return `
    <button class="node-rotate-handle" type="button" tabindex="-1" aria-label="Rotate guide"></button>
  `;
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
  const codeMarkup = node.type === 'game' || isBubbleLikeType(node.type)
    ? ''
    : `<div class="node-code">${escapeHtml(config.code)} / ${escapeHtml(formatNodeId(node.id))}</div>`;
  const inPortMarkup = buildInPortMarkup(node);
  const chromeMarkup = `
    <div class="node-rotator">
      ${buildRotateHandleMarkup(node)}
      ${inPortMarkup}
      ${buildNodePieceMarkup(node)}
      ${buildOutPortsMarkup(node)}
    </div>
  `;
  if (node.type === 'stop') {
    return `
      <div class="node-card">
        ${chromeMarkup}
        <div class="node-content">
          <div>
            <div class="node-kicker">${escapeHtml(kicker)}</div>
            <div class="node-title"${getGameTitleStyle(node, displayTitle)}>${escapeHtml(displayTitle)}</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="node-card">
      ${chromeMarkup}
      <div class="node-content">
        <div>
          <div class="node-kicker">${escapeHtml(kicker)}</div>
          <div class="node-title"${getGameTitleStyle(node, displayTitle)}>${escapeHtml(displayTitle)}</div>
        </div>
        ${bodyMarkup}
        ${codeMarkup}
      </div>
    </div>
  `;
}

function positionNodeElement(node, el) {
  el.style.transform = 'translate(' + node.x + 'px,' + node.y + 'px)';
  el.style.width = node.width + 'px';
  el.style.height = node.height + 'px';
  el.style.setProperty('--node-rotation', getNodeRotation(node) + 'deg');
}

function positionGhost(ghostEl, clientX, clientY) {
  ghostEl.style.transform = 'translate(' + (clientX + 16) + 'px,' + (clientY + 16) + 'px) scale(.84)';
}

function applyZoom() {
  const base = getBoardBaseSize();
  board.style.width = Math.round(base.width) + 'px';
  board.style.height = Math.round(base.height) + 'px';
  board.style.transform = 'scale(' + state.zoom + ')';
  boardStage.style.width = Math.round(base.width * state.zoom) + 'px';
  boardStage.style.height = Math.round(base.height * state.zoom) + 'px';
  zoomValue.textContent = Math.round(state.zoom * 100) + '%';
}

function setZoom(nextZoom, clientX, clientY) {
  const roundedZoom = Math.round(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX) * 100) / 100;
  if (roundedZoom === state.zoom) return;

  const rect = viewport.getBoundingClientRect();
  const anchorX = clientX ?? (rect.left + rect.width / 2);
  const anchorY = clientY ?? (rect.top + rect.height / 2);
  const focus = boardPointFromClient(anchorX, anchorY);

  state.zoom = roundedZoom;
  applyZoom();

  viewport.scrollLeft = focus.x * state.zoom - (anchorX - rect.left);
  viewport.scrollTop = focus.y * state.zoom - (anchorY - rect.top);

  drawLinks();
}

function boardPointFromClient(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    x: (clientX - rect.left + viewport.scrollLeft) / state.zoom,
    y: (clientY - rect.top + viewport.scrollTop) / state.zoom
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
  const boardWidth = board.clientWidth || getBoardBaseSize().width;
  const boardHeight = board.clientHeight || getBoardBaseSize().height;
  const obstacle = getLinkObstacle(node);

  return {
    left: clamp(Math.min((cell.col * major) + LINK_LANE_OFFSET, obstacle.left), LINK_LANE_OFFSET, boardWidth - LINK_LANE_OFFSET),
    right: clamp(Math.max(((cell.col + 1) * major) - LINK_LANE_OFFSET, obstacle.right), LINK_LANE_OFFSET, boardWidth - LINK_LANE_OFFSET),
    top: clamp(Math.min((cell.row * major) + LINK_LANE_OFFSET, obstacle.top), LINK_LANE_OFFSET, boardHeight - LINK_LANE_OFFSET),
    bottom: clamp(Math.max(((cell.row + 1) * major) - LINK_LANE_OFFSET, obstacle.bottom), LINK_LANE_OFFSET, boardHeight - LINK_LANE_OFFSET)
  };
}

function getSortedLaneYCandidates(fromNode, toNode, startY, endY) {
  const boardHeight = board.clientHeight || getBoardBaseSize().height;
  const major = getMajorGridSize();
  const rows = getPlacementGridRows();
  const candidates = new Map();

  function addCandidate(value, priority) {
    const clampedValue = clamp(Math.round(value * 1000) / 1000, LINK_LANE_OFFSET, boardHeight - LINK_LANE_OFFSET);
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

  if (laneY == null) laneY = candidateYs[0] ?? clamp((points.startY + points.endY) / 2, LINK_LANE_OFFSET, (board.clientHeight || getBoardBaseSize().height) - LINK_LANE_OFFSET);

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
  linkLayer.setAttribute('viewBox', '0 0 ' + board.clientWidth + ' ' + board.clientHeight);
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
    node.title = String(nextValue || '').trim() || TYPE_CONFIG[node.type].title;
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
  input.value = String(node.title || TYPE_CONFIG[node.type].title);

  titleEl.hidden = true;
  titleWrap.appendChild(input);

  const syncInspectorTitle = () => {
    if (state.selectedId !== nodeId) return;
    if (node.type === 'game') nodeTitleInput.value = input.value;
    if (node.type === 'stop') stopNameInput.value = input.value;
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
    if (node.type === 'bubble') {
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
    const editableTitleClicked = usesNodeTitle(node.type) && !!event.target.closest('.node-title');
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
    const editableTitleClicked = usesNodeTitle(node.type) && !!event.target.closest('.node-title');
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

    const point = boardPointFromClient(event.clientX, event.clientY);
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
  el.className = 'node-shell node--' + node.type;
  el.dataset.id = node.id;
  el.innerHTML = buildNodeMarkup(node);
  positionNodeElement(node, el);
  attachNodeEvents(el, node);
  nodeLayer.appendChild(el);
  nodeEls.set(node.id, el);
}

function renderAll() {
  applyZoom();
  nodeLayer.innerHTML = '';
  nodeEls.clear();

  if (state.doc.nodes.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'board-empty-hint';
    hint.innerHTML = 'Use <strong>Insert</strong> in the menu above to add objects.';
    nodeLayer.appendChild(hint);
  }

  state.doc.nodes.forEach(renderNode);
  updateStencilAvailability();
  renderSelectionStates();
  drawLinks();
  updateSelectionUi();
}

function updateStencilAvailability() {
  const gameTaken = hasGameNode();
  stencilBar.querySelectorAll('[data-stencil]').forEach((button) => {
    const isGameStencil = button.dataset.stencil === 'game';
    button.disabled = isGameStencil && gameTaken;
    if (isGameStencil) {
      button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
      button.title = button.disabled ? 'Only one Game object is allowed per canvas.' : '';
    }
  });
}

function updateSelectionUi() {
  const node = getNode(state.selectedId);
  const link = getLink(state.selectedLinkId);
  const hasSelection = !!(node || link);
  if (inspector) inspector.hidden = !hasSelection;
  objectCard.hidden = !hasSelection;
  inspectorContent.hidden = !hasSelection;
  behaviorCard.hidden = hasSelection;

  // Transit board: type theming
  const NODE_CODES = { game: 'GM', stop: 'ST', bubble: 'GD', reply: 'PL' };
  if (inspector) inspector.dataset.nodeType = node ? node.type : link ? 'link' : '';
  if (inspRouteBadge) {
    const code = node ? NODE_CODES[node.type] : link ? '\u2192' : '';
    inspRouteBadge.textContent = code;
    inspRouteBadge.hidden = !code;
  }

  const NODE_COPY = {
    game: 'Your game starts here. Fill in the associated fields.',
    stop: 'A location on your tour. Stop notes are just for you — players never see them.',
    bubble: 'A single text message from your guide. You can include variables by typing % and choosing from available variables.',
    reply: 'The player sends a text back. Give it a MESSAGE NAME to save what they typed — you can drop that saved reply into any message later. Add a GUESS if you\'re checking for a specific answer, or leave it blank to accept anything they send.',
  };
  const anytimeCopy = node && isAnytimeReplyNode(node)
    ? 'A reply that listens all game long. Set a GUESS word and it\'ll be checked no matter where the player is. MESSAGE NAME saves what they typed when it matches.'
    : node && isAnytimeGuideNode(node)
      ? 'The message your guide sends when a PLAYER ANYTIME triggers. After this, the game picks back up where the player left off.'
      : '';
  inspectorCopy.textContent = node
    ? (anytimeCopy || NODE_COPY[node.type] || 'Edit the selected object.')
    : link
      ? 'This connector is selected. Press Delete or use the button below to remove it.'
      : 'Select an object to edit it. Connections can fan out to more than one destination.';

  const isGameNode = !!node && node.type === 'game';
  const isStopNode = !!node && node.type === 'stop';
  const isReplyNode = !!node && node.type === 'reply';
  const isLinkSelected = !!link;

  titleField.hidden = isLinkSelected || !isGameNode;
  stopNameField.hidden = isLinkSelected || !isStopNode;
  varNameField.hidden = isLinkSelected || !isReplyNode;
  varValuesField.hidden = true;
  descriptionField.hidden = isLinkSelected || !node;
  ifThenField.hidden = true;
  taglineField.hidden = isLinkSelected || !isGameNode;
  guideNameField.hidden = isLinkSelected || !isGameNode;
  priceField.hidden = isLinkSelected || !isGameNode;
  tagsField.hidden = isLinkSelected || !isGameNode;
  const BODY_LABELS = { game: 'Description', stop: 'STOP NOTES', bubble: 'Guide Message', reply: 'GUESS' };
  nodeTitleLabel.textContent = 'GAME NAME';
  nodeBodyLabel.textContent = node
    ? (isAnytimeGuideNode(node) ? 'ANYTIME RESPONSE' : (BODY_LABELS[node.type] || 'Notes'))
    : 'Notes';
  if (nodeBodyInfo) nodeBodyInfo.hidden = !isStopNode || isLinkSelected;

  nodeTitleInput.disabled = !isGameNode;
  stopNameInput.disabled = !isStopNode;
  varNameInput.disabled = !isReplyNode;
  nodeTaglineInput.disabled = !isGameNode;
  nodeGuideNameInput.disabled = !isGameNode;
  nodePriceInput.disabled = !isGameNode;
  nodeTagNewInput.disabled = !isGameNode;
  nodeTagAddBtn.disabled = !isGameNode;
  nodeBodyInput.disabled = isLinkSelected || !node;

  deleteBtn.disabled = node ? node.type === 'game' : !link;
  deleteBtn.textContent = link ? 'Delete Connection' : 'Delete Object';

  nodeTitleInput.value = isGameNode ? node.title : '';
  stopNameInput.value = isStopNode && node ? node.title : '';
  varNameInput.value = isReplyNode && node ? (node.varName || '') : '';
  varNameInput.placeholder = 'e.g. name';
  varValueInputs.forEach((input) => { input.value = ''; input.disabled = true; });
  varCorrectRadios.forEach((radio, i) => {
    radio.checked = false;
    radio.disabled = true;
  });
  nodeTaglineInput.value = isGameNode ? (node.tagline || '') : '';
  nodeGuideNameInput.value = isGameNode ? (node.guideName || '') : '';
  nodePriceInput.value = isGameNode ? (node.price || '') : '';
  nodeTagNewInput.value = '';
  renderTagPicker(node);
  nodeBodyInput.value = node ? (node.body || '') : '';
  nodeBodyInput.placeholder = isReplyNode ? 'e.g. READY, YES, LETS GO. Leave blank to accept any value.' : '';
  selectionId.textContent = node
    ? 'ID: ' + formatNodeId(node.id)
    : link
      ? 'LINK: ' + link.id
      : 'ID: none';
  if (!node || node.type !== 'bubble' || document.activeElement !== nodeBodyInput) {
    closeVariableAutocomplete();
  }
  updateActionUi();
  refreshInspectorWindowUi();
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
    x: clamp(snap((board.clientWidth || getBoardBaseSize().width) / 2 - (config.width / 2)), bounds.minX, bounds.maxX),
    y: clamp(snap((board.clientHeight || getBoardBaseSize().height) / 2 - (config.height / 2)), bounds.minY, bounds.maxY)
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
  const centerPoint = boardPointFromClient(
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
  const duplicate = {
    id: makeId(source.type),
    type: source.type,
    x: placement.x,
    y: placement.y,
    width: TYPE_CONFIG[source.type].width,
    height: TYPE_CONFIG[source.type].height,
    title: usesNodeTitle(source.type) ? source.title : '',
    tagline: source.tagline || '',
    guideName: source.guideName || '',
    price: source.price || '',
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
    body: source.body || '',
    varName: source.varName || '',
    anytime: false,
    anytimePairId: '',
    rotation: getNodeRotation(source)
  };
  if (duplicate.type === 'reply') {
    duplicate.varName = makeUniqueReplyVariableName(
      duplicate.varName || buildBestGuessReplyVariableName(duplicate, source),
      duplicate.id
    );
  }

  state.doc.nodes.push(duplicate);
  tryAutoConnectNewNode(duplicate, source);
  selectNode(duplicate.id);
  renderAll();
  return duplicate;
}

function addNode(type, x, y, options = {}) {
  if (type === 'game' && hasGameNode()) {
    alert('Only one Game object is allowed per canvas.');
    return null;
  }

  const sourceNode = getAutoLinkSourceNode();
  const node = createNode(type, x, y);
  if (type === 'reply') ensureReplyVarName(node, sourceNode);
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
    ? makeUniqueReplyVariableName(sourceReply.varName || buildBestGuessReplyVariableName(sourceReply, sourceReply), replyNode.id)
    : '';
  ensureReplyVarName(replyNode, sourceReply || null);

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

function addAnytimePairToVisibleCanvas() {
  const placement = getAutoAnytimePairPlacement();
  return insertAnytimePairAt(placement.reply, placement.bubble);
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

function removeSelectedNode() {
  if (!state.selectedId) return;
  const selectedNode = getNode(state.selectedId);
  if (selectedNode && selectedNode.type === 'game') return;
  if (selectedNode && getAnytimePairId(selectedNode)) {
    if (removeAnytimePair(selectedNode.anytimePairId)) renderAll();
    return;
  }
  const nodeId = state.selectedId;
  state.doc.nodes = state.doc.nodes.filter((node) => node.id !== nodeId);
  state.doc.links = state.doc.links.filter((link) => link.from !== nodeId && link.to !== nodeId);
  state.selectedLinkId = null;
  state.selectedId = state.doc.nodes.length ? state.doc.nodes[state.doc.nodes.length - 1].id : null;
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

function startStencilDrag(type, event) {
  if (type === 'game' && hasGameNode()) {
    alert('Only one Game object is allowed per canvas.');
    return;
  }
  const config = TYPE_CONFIG[type];
  const ghostNode = {
    id: 'preview',
    type,
    width: config.width,
    height: config.height,
    title: config.title,
    body: config.body
  };
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost node-shell node--' + type;
  ghost.style.width = ghostNode.width + 'px';
  ghost.style.height = ghostNode.height + 'px';
  ghost.innerHTML = buildNodeMarkup(ghostNode);
  document.body.appendChild(ghost);
  positionGhost(ghost, event.clientX, event.clientY);

  state.stencilDrag = {
    type,
    ghostEl: ghost
  };
  viewport.classList.add('drop-ready');
}

function stopStencilDrag(clientX, clientY) {
  if (!state.stencilDrag) return;
  const drag = state.stencilDrag;
  const point = boardPointFromClient(clientX, clientY);

  if (point.inside) {
    const config = TYPE_CONFIG[drag.type];
    addNode(drag.type, point.x - config.width / 2, point.y - config.height / 2);
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

function addNodeToVisibleCanvas(type) {
  const sourceNode = getAutoLinkSourceNode();
  const placement = getAutoPlacementPosition(type, sourceNode);
  return addNode(
    type,
    placement.x,
    placement.y,
    { skipMajorSnap: true }
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

  if (clientX < rect.left + threshold) viewport.scrollLeft -= step;
  if (clientX > rect.right - threshold) viewport.scrollLeft += step;
  if (clientY < rect.top + threshold) viewport.scrollTop -= step;
  if (clientY > rect.bottom - threshold) viewport.scrollTop += step;
}

function seedBoard() {
  state.doc = cloneObj(EMPTY_DOC);
  state.currentGameId = null;
  clearSelection();
  state.nextNodeNumbers = createNodeIdCounters();
  const firstSlot = getGameHomeSlot();
  const gameNode = createNode('game', firstSlot.x, firstSlot.y);
  state.doc.nodes.push(gameNode);
  const stopSlot = getGridSlotPosition('stop', 1, 0);
  const stopNode = createNode('stop', stopSlot.x, stopSlot.y);
  state.doc.nodes.push(stopNode);
  createLink(gameNode.id, stopNode.id);
  syncAllTagsFromStore();
  rememberCleanSnapshot();
  renderOpenGameDialogList();
  applyZoom();
  renderAll();
}

function serializeDoc() {
  return {
    updatedAt: new Date().toISOString(),
    nodes: state.doc.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      title: node.title,
      tagline: node.tagline || '',
      guideName: node.guideName || '',
      price: node.price || '',
      tags: (node.tags || []).filter(Boolean),
      body: node.body,
      varName: node.varName || '',
      anytime: !!node.anytime,
      anytimePairId: node.anytimePairId || '',
      rotation: getNodeRotation(node)
    })),
    links: state.doc.links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      fromPort: normalizeFromPort(getNode(link.from) || parseTypedNodeId(link.from)?.type, link.fromPort)
    }))
  };
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
    localStorage.setItem('tgb-games-new', JSON.stringify(state.store));
    if (state.currentGameId) localStorage.setItem('tgb-games-new-open', state.currentGameId);
    else localStorage.removeItem('tgb-games-new-open');
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

async function saveDoc(options = {}) {
  const silent = !!options.silent;
  const replyVarsFilled = ensureAllReplyVarNames();
  if (replyVarsFilled) renderAll();
  const docPayload = serializeDoc();
  const existingGame = state.store.games.find((game) => game.id === state.currentGameId);
  const savedGame = {
    id: state.currentGameId || makeGameId(),
    name: getDocName(docPayload),
    createdAt: existingGame && existingGame.createdAt ? existingGame.createdAt : docPayload.updatedAt,
    updatedAt: docPayload.updatedAt,
    nodes: docPayload.nodes,
    links: docPayload.links
  };

  state.currentGameId = savedGame.id;
  state.doc.updatedAt = docPayload.updatedAt;
  state.store.updatedAt = docPayload.updatedAt;

  const existingIndex = state.store.games.findIndex((game) => game.id === savedGame.id);
  if (existingIndex >= 0) state.store.games[existingIndex] = savedGame;
  else state.store.games.push(savedGame);

  syncAllTagsFromStore();
  renderOpenGameDialogList();
  persistStoreLocally();
  rememberCleanSnapshot();
  updateActionUi();

  try {
    const apiBases = getApiBaseCandidates();
    let lastError = null;

    for (const apiBase of apiBases) {
      try {
        const res = await fetch(apiBase + '/games-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.store)
        });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || 'Save failed');
        }
        if (!silent) alert('Saved all data to play\\data\\games_new.json.');
        return { savedGame, serverSaved: true, localOnly: false, apiBase };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    if (!silent) alert('Saved all data in this browser only. Run the local Node server to write play\\data\\games_new.json.');
    return { savedGame, serverSaved: false, localOnly: true };
  } catch (error) {
    if (!silent) alert('Server save failed. Start the local Node server on http://localhost:3000. Kept all data in this browser only.');
    return { savedGame, serverSaved: false, localOnly: true, error };
  }
}

async function playCurrentGame() {
  const result = await saveDoc({ silent: true });
  const savedGame = result && result.savedGame ? result.savedGame : null;
  const gameQuery = savedGame && savedGame.name ? savedGame.name : getDocName();
  if (!gameQuery) return;
  rememberPlayPreview(savedGame);
  const target = new URL('../index.html', location.href);
  target.searchParams.set('game', gameQuery);
  location.href = target.toString();
}

async function loadDoc() {
  let nextStore = null;

  try {
    const urls = getGameDataFetchUrls();
    let res = null;
    for (const url of urls) {
      try { res = await fetch(url, { cache: 'no-store' }); if (res.ok) break; } catch (e) {}
    }
    if (res.ok) {
      const raw = await res.json();
      if (raw && typeof raw === 'object' && Array.isArray(raw.games) && raw._comment === STORE_COMMENT) {
        nextStore = normalizeStore(raw);
      } else {
        const legacy = Array.isArray(raw) ? raw : (Array.isArray(raw.games) ? raw.games : []);
        const converted = legacy
          .filter((g) => !g.archived)
          .map((g, i) => ({
            id: g.id || ('game-' + i),
            name: g.name || 'Untitled',
            createdAt: g.createdAt || g.updatedAt || '',
            updatedAt: g.updatedAt || '',
            nodes: [{
              id: 'gm-01',
              type: 'game',
              x: 64, y: 64,
              width: TYPE_CONFIG.game.width,
              height: TYPE_CONFIG.game.height,
              title: g.name || 'Untitled',
              tagline: g.tagline || '',
              guideName: g.subtitle || '',
              price: g.price || '',
              tags: (g.tag || '').split(/[;,]/).map((t) => t.trim()).filter(Boolean),
              body: (g.description || '').replace(/<[^>]+>/g, '').trim()
            }],
            links: []
          }));
        if (converted.length > 0) {
          nextStore = { _comment: STORE_COMMENT, updatedAt: '', games: converted };
        }
      }
    }
  } catch (error) {
  }

  state.store = nextStore || cloneObj(EMPTY_STORE);
  syncAllTagsFromStore();
  renderOpenGameDialogList();

  const rememberedGameId = getRememberedOpenGameId();
  if (rememberedGameId && state.store.games.some((game) => game.id === rememberedGameId)) {
    openSavedGame(rememberedGameId);
    return;
  }

  if (state.store.games.length) {
    const newestGame = [...state.store.games].sort(compareSavedGamesNewestFirst)[0];
    if (newestGame) {
      openSavedGame(newestGame.id);
      return;
    }
  }

  seedBoard();
}

stencilBar.querySelectorAll('[data-stencil]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startStencilDrag(button.dataset.stencil, event);
  });

  button.addEventListener('dblclick', (event) => {
    event.preventDefault();
    cancelStencilDrag();
    addNodeToVisibleCanvas(button.dataset.stencil);
  });
});

nodeTitleInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'game') return;
  node.title = nodeTitleInput.value || TYPE_CONFIG[node.type].title;
  renderAll();
});

stopNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'stop') return;
  node.title = stopNameInput.value || TYPE_CONFIG.stop.title;
  renderAll();
});


varNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'reply') return;
  node.varName = normalizeVariableName(varNameInput.value);
  renderAll();
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
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'game') return;
  node.tagline = nodeTaglineInput.value;
  updateSelectionUi();
});

nodeGuideNameInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'game') return;
  node.guideName = nodeGuideNameInput.value;
  updateSelectionUi();
});

nodePriceInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'game') return;
  node.price = nodePriceInput.value;
  updateSelectionUi();
});

function addNewTag() {
  const node = getNode(state.selectedId);
  if (!node || node.type !== 'game') return;
  const value = nodeTagNewInput.value.trim();
  if (!value) return;
  if (!allTags.includes(value)) allTags.push(value);
  const nextTags = new Set(node.tags || []);
  nextTags.add(value);
  node.tags = [...nextTags];
  nodeTagNewInput.value = '';
  renderTagPicker(node);
}

nodeTagAddBtn.addEventListener('click', addNewTag);
nodeTagNewInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addNewTag();
});

nodeBodyInput.addEventListener('input', () => {
  const node = getNode(state.selectedId);
  if (!node) return;
  node.body = nodeBodyInput.value;
  renderAll();
  updateVariableAutocomplete();
});

nodeBodyInput.addEventListener('click', updateVariableAutocomplete);
nodeBodyInput.addEventListener('focus', updateVariableAutocomplete);
nodeBodyInput.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (document.activeElement !== nodeBodyInput) closeVariableAutocomplete();
  }, 0);
});
nodeBodyInput.addEventListener('keyup', (event) => {
  if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
  updateVariableAutocomplete();
});
nodeBodyInput.addEventListener('keydown', (event) => {
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

deleteBtn.addEventListener('click', () => {
  if (state.selectedLinkId) {
    removeSelectedLink();
    return;
  }
  removeSelectedNode();
});
if (saveGameBtn) saveGameBtn.addEventListener('click', saveCurrentGameFromMenu);
if (headerPlayGameBtn) headerPlayGameBtn.addEventListener('click', playCurrentGame);
openGameBtn.addEventListener('click', () => {
  const menu = openGameBtn.closest('.mb-menu');
  const panel = openGameBtn.closest('.mb-panel');
  if (menu) menu.classList.remove('open');
  if (panel) panel.hidden = true;
  openOpenGameDialog();
});
if (refreshPageBtn) {
  refreshPageBtn.addEventListener('click', () => {
    const menu = refreshPageBtn.closest('.mb-menu');
    const panel = refreshPageBtn.closest('.mb-panel');
    if (menu) menu.classList.remove('open');
    if (panel) panel.hidden = true;
    attemptRefresh();
  });
}
if (saveRefreshBtn) saveRefreshBtn.addEventListener('click', saveThenRefresh);
if (discardRefreshBtn) discardRefreshBtn.addEventListener('click', refreshWithoutSaving);
if (refreshDialog) {
  refreshDialog.addEventListener('click', (event) => {
    if (event.target === refreshDialog) closeRefreshDialog();
  });
}
if (confirmOpenGameBtn) confirmOpenGameBtn.addEventListener('click', openSelectedGameFromDialog);
if (cancelOpenGameBtn) cancelOpenGameBtn.addEventListener('click', closeOpenGameDialog);
if (openGameDialogSelect) {
  openGameDialogSelect.addEventListener('change', () => {
    if (confirmOpenGameBtn) confirmOpenGameBtn.disabled = !openGameDialogSelect.value;
  });
  openGameDialogSelect.addEventListener('dblclick', openSelectedGameFromDialog);
}
if (openGameDialog) {
  openGameDialog.addEventListener('click', (event) => {
    if (event.target === openGameDialog) closeOpenGameDialog();
  });
}
if (nodeContextMenu) {
  nodeContextMenu.addEventListener('click', (event) => {
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
  deleteNodeMenuBtn.addEventListener('click', () => {
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
    removeSelectedNode();
  });
}
if (inspectorToggleBtn) {
  inspectorToggleBtn.addEventListener('click', () => {
    toggleInspectorCollapsed();
  });
}
if (inspectorWindowBar) {
  inspectorWindowBar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !inspector || inspector.hidden) return;
    if (event.target.closest('button')) return;
    const origin = state.inspectorPosition || getDefaultInspectorPosition();
    state.inspectorDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y
    };
    inspector.classList.add('dragging');
    event.preventDefault();
  });
}

newBoardBtn.addEventListener('click', () => {
  if (!confirm('Start a new canvas? This will replace the current graph in the editor until you reload or save.')) return;
  seedBoard();
});

zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - ZOOM_STEP));
zoomInBtn.addEventListener('click', () => setZoom(state.zoom + ZOOM_STEP));
zoomResetBtn.addEventListener('click', () => setZoom(1));

linkLayer.addEventListener('click', (event) => {
  if (event.target !== linkLayer) return;
  const point = boardPointFromClient(event.clientX, event.clientY);
  const linkId = findNearestLinkIdAtPoint(point.x, point.y);
  if (!linkId) return;
  event.preventDefault();
  event.stopPropagation();
  closeNodeContextMenu();
  selectLinkAndRefresh(linkId);
});

linkLayer.addEventListener('contextmenu', (event) => {
  if (event.target !== linkLayer) return;
  const point = boardPointFromClient(event.clientX, event.clientY);
  const linkId = findNearestLinkIdAtPoint(point.x, point.y);
  if (!linkId) return;
  event.preventDefault();
  event.stopPropagation();
  closeNodeContextMenu();
  selectLinkAndRefresh(linkId);
  openLinkContextMenu(linkId, event.clientX, event.clientY);
});

board.addEventListener('click', (event) => {
  closeNodeContextMenu();
  if (state.suppressBackgroundClick) {
    state.suppressBackgroundClick = false;
    return;
  }
  if (event.target !== board && event.target !== nodeLayer && event.target !== linkLayer) return;
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
  if (target.closest && target.closest('.zoom-controls')) return;
  if (target === linkLayer) {
    const point = boardPointFromClient(event.clientX, event.clientY);
    if (findNearestLinkIdAtPoint(point.x, point.y)) return;
  }
  const isCanvasTarget =
    target === viewport ||
    target === boardStage ||
    target === board ||
    target === nodeLayer ||
    target === linkLayer;
  if (!isCanvasTarget) return;

  event.preventDefault();
  state.panCanvas = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    moved: false
  };
  viewport.classList.add('panning');
});

viewport.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  setZoom(state.zoom + (ZOOM_STEP * direction), event.clientX, event.clientY);
}, { passive: false });

window.addEventListener('pointermove', (event) => {
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
    const point = boardPointFromClient(event.clientX, event.clientY);
    viewport.classList.toggle('drop-ready', point.inside);
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.dragNode) {
    const node = getNode(state.dragNode.id);
    const el = nodeEls.get(state.dragNode.id);
    if (!node || !el) return;
    const point = boardPointFromClient(event.clientX, event.clientY);
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
    const point = boardPointFromClient(event.clientX, event.clientY);
    state.connectDrag.x = clamp(point.x, 0, board.clientWidth);
    state.connectDrag.y = clamp(point.y, 0, board.clientHeight);
    updateHoverTarget(event.clientX, event.clientY);
    drawLinks();
    maybeAutoPan(event.clientX, event.clientY);
  }

  if (state.panCanvas) {
    const dx = event.clientX - state.panCanvas.startX;
    const dy = event.clientY - state.panCanvas.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.panCanvas.moved = true;
    }
    viewport.scrollLeft = state.panCanvas.scrollLeft - dx;
    viewport.scrollTop = state.panCanvas.scrollTop - dy;
  }
});

window.addEventListener('pointerup', (event) => {
  if (state.inspectorDrag) {
    if (inspector) inspector.classList.remove('dragging');
    state.inspectorDrag = null;
  }

  if (state.stencilDrag) stopStencilDrag(event.clientX, event.clientY);

  if (state.dragNode) {
    const dragState = state.dragNode;
    const el = nodeEls.get(state.dragNode.id);
    if (el) el.classList.remove('dragging');
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

  if (state.panCanvas) {
    if (state.panCanvas.moved) {
      state.suppressBackgroundClick = true;
    }
    state.panCanvas = null;
    viewport.classList.remove('panning');
  }
});

window.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement && document.activeElement.tagName;
  const isTyping =
    activeTag === 'INPUT'
    || activeTag === 'TEXTAREA'
    || activeTag === 'SELECT'
    || (document.activeElement && document.activeElement.isContentEditable);

  if (nodeContextMenu && !nodeContextMenu.hidden && event.key === 'Escape') {
    event.preventDefault();
    closeNodeContextMenu();
    return;
  }

  if (refreshDialog && !refreshDialog.hidden && event.key === 'Escape') {
    event.preventDefault();
    closeRefreshDialog();
    return;
  }

  if (openGameDialog && !openGameDialog.hidden && event.key === 'Escape') {
    event.preventDefault();
    closeOpenGameDialog();
    return;
  }

  if (isRefreshShortcut(event)) {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    openRefreshDialog();
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

  if (isZoomInShortcut(event)) {
    if (isTyping && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.zoom + ZOOM_STEP);
    return;
  }

  if (isZoomOutShortcut(event)) {
    if (isTyping && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.zoom - ZOOM_STEP);
    return;
  }

  if (isZoomResetShortcut(event)) {
    if (isTyping && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(1);
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyN')) {
    event.preventDefault();
    newBoardBtn.click();
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyO')) {
    event.preventDefault();
    openOpenGameDialog();
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyS')) {
    event.preventDefault();
    addNodeToVisibleCanvas('stop');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyG')) {
    event.preventDefault();
    addNodeToVisibleCanvas('bubble');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyP')) {
    event.preventDefault();
    addNodeToVisibleCanvas('reply');
    return;
  }

  if (!isTyping && isLetterShortcut(event, 'KeyA')) {
    event.preventDefault();
    addAnytimePairToVisibleCanvas();
    return;
  }

  if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace') && (state.selectedId || state.selectedLinkId)) {
    event.preventDefault();
    if (state.selectedLinkId) removeSelectedLink();
    else removeSelectedNode();
  }
});

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

  // Insert menu — click to add node at canvas center
  const insertPanel = document.getElementById('mbPanelInsert');
  if (insertPanel) {
    insertPanel.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeAll();
        handleInsertAction(btn.dataset.insert);
      });
    });
  }
}());

window.addEventListener('beforeunload', (event) => {
  if (state.skipBeforeUnload || !hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('pointerdown', (event) => {
  if (!nodeContextMenu || nodeContextMenu.hidden) return;
  if (nodeContextMenu.contains(event.target)) return;
  closeNodeContextMenu();
});

window.addEventListener('resize', () => {
  applyZoom();
  drawLinks();
  applyInspectorPosition();
});

applyZoom();
loadDoc();






