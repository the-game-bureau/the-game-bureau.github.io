const TYPE_CONFIG = {
  game: {
    width: 220,
    height: 140,
    kicker: 'Game',
    title: 'Untitled Game',
    body: 'A guided SMS adventure through the city.',
    code: 'GM'
  },
  stop: {
    width: 150,
    height: 150,
    kicker: 'Stop',
    title: 'Stop Name',
    body: '',
    code: 'ST'
  },
  ask: {
    width: 260,
    height: 130,
    kicker: 'Ask',
    title: 'Ask',
    body: '',
    code: 'ASK'
  },
  bubble: {
    width: 220,
    height: 140,
    kicker: 'Bubble',
    title: 'Guide Message',
    body: '',
    code: 'BB'
  },
};

const ALL_TAGS = ['Mystery', 'Puzzle', 'SMS', 'Walking Tour', 'Sports', 'History', 'Food', 'Adventure', 'Family', 'Conspiracy', 'Trivia', 'Horror', 'Romance', 'Comedy', 'Music', 'Culture', 'Night Life', 'City Tour', 'Scavenger Hunt', 'New Orleans'];

const STORE_COMMENT = 'File: games_new.json | Purpose: experimental graph-builder data for the new builder canvas.';

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

const ASK_PORT_COUNT = 4;
const ASK_PORTS = Array.from({ length: ASK_PORT_COUNT }, (_, index) => 'ans-' + (index + 1));
// 4 output ports evenly spaced along the bottom edge
const ASK_PORT_XY = [
  { x: 0.125, y: 1.0 },
  { x: 0.375, y: 1.0 },
  { x: 0.625, y: 1.0 },
  { x: 0.875, y: 1.0 },
];

const API = /^(http|https):$/.test(location.protocol) ? location.origin : null;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const viewport = document.getElementById('viewport');
const boardStage = document.getElementById('boardStage');
const board = document.getElementById('board');
const linkLayer = document.getElementById('linkLayer');
const nodeLayer = document.getElementById('nodeLayer');
const stencilBar = document.getElementById('stencilBar');
const selectionLabel = document.getElementById('selectionLabel');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomValue = document.getElementById('zoomValue');
const objectCard = document.getElementById('objectCard');
const inspectorHeading = document.getElementById('inspectorHeading');
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
const nodeBodyInput = document.getElementById('nodeBodyInput');

const varNameField = document.getElementById('varNameField');
const varNameInput = document.getElementById('varNameInput');
const varValuesField = document.getElementById('varValuesField');
const varValueInputs = [1, 2, 3, 4].map((index) => document.getElementById('varValue' + index));
const varCorrectRadios = [0, 1, 2, 3].map((index) => document.getElementById('varCorrect' + index));
const ifThenBranchInputs = [1, 2, 3, 4].map((index) => document.getElementById('ifThenBranch' + index));
const openGameSelect = document.getElementById('openGameSelect');
const openGameBtn = document.getElementById('openGameBtn');
const incomingCount = document.getElementById('incomingCount');
const outgoingCount = document.getElementById('outgoingCount');
const statsPanel = document.querySelector('.stats');
const selectionId = document.getElementById('selectionId');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');
const newBoardBtn = document.getElementById('newBoardBtn');

const nodeEls = new Map();
let allTags = [...ALL_TAGS];

const state = {
  store: cloneObj(EMPTY_STORE),
  doc: cloneObj(EMPTY_DOC),
  currentGameId: null,
  selectedId: null,
  selectedLinkId: null,
  dragNode: null,
  panCanvas: null,
  stencilDrag: null,
  connectDrag: null,
  hoverTargetId: null,
  suppressBackgroundClick: false,
  zoom: 1,
  nextId: 1
};

function cloneObj(value) {
  return JSON.parse(JSON.stringify(value));
}

function snap(value) {
  const size = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--snap'), 10) || 12;
  return Math.round(value / size) * size;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId() {
  const id = 'node-' + state.nextId;
  state.nextId += 1;
  return id;
}

function makeGameId() {
  return 'game-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
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

function countLinks(id, direction) {
  return state.doc.links.filter((link) => link[direction] === id).length;
}


function normalizeVarValues(raw) {
  return Array.from({ length: 4 }, (_, index) => {
    if (Array.isArray(raw) && raw[index] != null) return String(raw[index]);
    return '';
  });
}

function syncNextId() {
  const maxId = state.doc.nodes.reduce((max, node) => {
    const match = /node-(\d+)/.exec(node.id || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  state.nextId = maxId + 1;
}

function normalizeNode(raw) {
  const type = TYPE_CONFIG[raw && raw.type] ? raw.type : 'stop';
  const config = TYPE_CONFIG[type];
  return {
    id: raw && raw.id ? String(raw.id) : makeId(),
    type,
    x: snap(Number(raw && raw.x) || 0),
    y: snap(Number(raw && raw.y) || 0),
    width: config.width,
    height: config.height,
    title: raw && raw.title ? String(raw.title) : config.title,
    tagline: raw && typeof raw.tagline === 'string' ? raw.tagline : '',
    guideName: raw && typeof raw.guideName === 'string' ? raw.guideName : '',
    price: raw && typeof raw.price === 'string' ? raw.price : '',
    varName: type === 'ask' && raw && typeof raw.varName === 'string' ? raw.varName : '',
    varValues: type === 'ask' ? normalizeVarValues(raw && raw.varValues) : [],
    varCorrect: type === 'ask' && raw && raw.varCorrect != null ? Number(raw.varCorrect) : null,
    tags: Array.isArray(raw && raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof (raw && raw.tag) === 'string'
        ? raw.tag.split(/[;,]+/).map((tag) => tag.trim()).filter(Boolean)
        : [],
    body: raw && raw.body ? String(raw.body) : config.body
  };
}

function normalizeDoc(raw) {
  const doc = raw && typeof raw === 'object' ? raw : {};
  const nodes = Array.isArray(doc.nodes) ? doc.nodes.map(normalizeNode) : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const legacyAskPortUsage = new Map();
  const links = Array.isArray(doc.links)
    ? doc.links
        .filter((link) => link && nodeIds.has(link.from) && nodeIds.has(link.to) && link.from !== link.to)
        .map((link, index) => {
          const from = String(link.from);
          const to = String(link.to);
          const fromNode = nodeMap.get(from);
          let fromPort = typeof link.fromPort === 'string' && link.fromPort ? String(link.fromPort) : 'out';

          if (fromNode && fromNode.type === 'ask') {
            if (!ASK_PORTS.includes(fromPort)) {
              const nextPortIndex = Math.min((legacyAskPortUsage.get(from) || 0) + 1, ASK_PORT_COUNT);
              legacyAskPortUsage.set(from, nextPortIndex);
              fromPort = ASK_PORTS[nextPortIndex - 1];
            }
          } else {
            fromPort = 'out';
          }

          return {
            id: link.id ? String(link.id) : 'link-' + index,
            from,
            to,
            fromPort
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

function normalizeSavedGame(raw, index) {
  const doc = normalizeDoc(raw);
  return {
    id: raw && raw.id ? String(raw.id) : 'game-' + (index + 1),
    name: raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : getDocName(doc),
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
    id: makeId(),
    type,
    x: snap(x),
    y: snap(y),
    width: config.width,
    height: config.height,
    title: config.title,
    varName: type === 'ask' ? 'favoriteSandwich' : '',
    varValues: type === 'ask' ? normalizeVarValues(['Poboy', 'Muffuletta', 'Hoagie', 'Cuban']) : [],
    varCorrect: null,
    tagline: type === 'game' ? 'Shall We Play A Game?' : '',
    guideName: type === 'game' ? 'Mission Control' : '',
    price: type === 'game' ? 'Free To Start / In App Purchases' : '',
    tags: [],
    body: config.body
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

function getLinkPortLabel(link) {
  const fromPort = (link && link.fromPort) || 'out';
  if (fromPort.startsWith('branch-')) {
    return 'OUT ' + fromPort.replace('branch-', '');
  }
  return fromPort.toUpperCase();
}

function getLinkSelectionLabel(link) {
  if (!link) return 'Connection';
  return 'CONNECTION / ' + getLinkPortLabel(link);
}

function renderGamePicker() {
  const games = state.store.games || [];
  openGameSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = games.length ? 'Choose a saved game' : 'No saved games yet';
  openGameSelect.appendChild(placeholder);

  games.forEach((game) => {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = formatSavedGameLabel(game);
    openGameSelect.appendChild(option);
  });

  openGameSelect.disabled = !games.length;
  openGameSelect.value = state.currentGameId && games.some((game) => game.id === state.currentGameId)
    ? state.currentGameId
    : '';
  openGameBtn.disabled = !openGameSelect.value;
}

function openSavedGame(gameId) {
  const game = state.store.games.find((entry) => entry.id === gameId);
  if (!game) return;

  state.currentGameId = game.id;
  state.doc = normalizeDoc(game);
  syncAllTagsFromStore();
  syncNextId();
  state.selectedLinkId = null;
  state.selectedId = state.doc.nodes.length ? state.doc.nodes[0].id : null;

  try {
    localStorage.setItem('tgb-games-new-open', game.id);
  } catch (error) {
  }

  renderGamePicker();
  renderAll();
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
  if (node.type === 'ask') {
    const varName = (node.varName || '').trim();
    const filled = normalizeVarValues(node.varValues).filter((v) => v.trim());
    const summary = filled.length ? filled.join(', ') : '';
    return (varName ? `<div class="node-varname">{{${escapeHtml(varName)}}}</div>` : '')
      + (summary ? `<div class="node-body">${escapeHtml(summary)}</div>` : '');
  }

  return node.body
    ? `<div class="node-body">${escapeHtml(node.body)}</div>`
    : '';
}

function buildOutPortsMarkup(node) {
  if (node.type === 'ask') {
    return ASK_PORTS.map((port, index) => {
      const val = (normalizeVarValues(node.varValues)[index] || '').trim();
      const aria = val ? 'Connect ' + val : 'Connect ans ' + (index + 1);
      return `
        <button class="node-port node-port--out" data-port="${port}" type="button" tabindex="-1" aria-label="${escapeHtml(aria)}"></button>
        <div class="node-port-label node-port-label--out" data-port="${port}">${escapeHtml(val || String(index + 1))}</div>
      `;
    }).join('');
  }

  return `
    <button class="node-port node-port--out" data-port="out" type="button" tabindex="-1" aria-label="Connect from ${escapeHtml(node.title)}"></button>
    <div class="node-port-label node-port-label--out" data-port="out">out</div>
  `;
}

function buildNodeMarkup(node) {
  const config = TYPE_CONFIG[node.type];
  const bodyMarkup = buildNodeBodyMarkup(node);
  const inPortMarkup = node.type === 'game'
    ? ''
    : `
    <button class="node-port node-port--in" type="button" tabindex="-1" aria-hidden="true"></button>
    <div class="node-port-label node-port-label--in">in</div>
  `;
  return `
    ${inPortMarkup}
    <div class="node-card">
      <div class="node-content">
        <div>
          <div class="node-kicker">${escapeHtml(config.kicker)}</div>
          <div class="node-title">${escapeHtml(node.title)}</div>
        </div>
        ${bodyMarkup}
        <div class="node-code">${escapeHtml(config.code)} / ${escapeHtml(node.id)}</div>
      </div>
    </div>
    ${buildOutPortsMarkup(node)}
  `;
}

function positionNodeElement(node, el) {
  el.style.transform = 'translate(' + node.x + 'px,' + node.y + 'px)';
  el.style.width = node.width + 'px';
  el.style.height = node.height + 'px';
}

function positionGhost(ghostEl, clientX, clientY) {
  ghostEl.style.transform = 'translate(' + (clientX + 16) + 'px,' + (clientY + 16) + 'px) scale(.84)';
}

function applyZoom() {
  const boardWidth = board.clientWidth;
  const boardHeight = board.clientHeight;
  board.style.transform = 'scale(' + state.zoom + ')';
  boardStage.style.width = Math.round(boardWidth * state.zoom) + 'px';
  boardStage.style.height = Math.round(boardHeight * state.zoom) + 'px';
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

function createPath(startX, startY, endX, endY) {
  const dy = Math.abs(endY - startY);
  const curve = Math.max(60, dy * 0.5);
  return 'M ' + startX + ' ' + startY +
    ' C ' + startX + ' ' + (startY + curve) +
    ' ' + endX + ' ' + (endY - curve) +
    ' ' + endX + ' ' + endY;
}

function getOutPortPoint(node, fromPort = 'out') {
  if (node.type === 'ask') {
    const index = ASK_PORTS.indexOf(fromPort);
    const pt = index >= 0 ? ASK_PORT_XY[index] : { x: 0.5, y: 1.0 };
    return {
      x: node.x + node.width * pt.x,
      y: node.y + node.height * pt.y
    };
  }

  return {
    x: node.x + node.width / 2,
    y: node.y + node.height
  };
}

function getLinkPoints(from, to, fromPort = 'out') {
  const start = getOutPortPoint(from, fromPort);
  return {
    startX: start.x,
    startY: start.y,
    endX: to.x + to.width / 2,
    endY: to.y
  };
}

function drawLinks() {
  linkLayer.innerHTML = '';
  linkLayer.setAttribute('viewBox', '0 0 ' + board.clientWidth + ' ' + board.clientHeight);

  state.doc.links.forEach((link) => {
    const from = getNode(link.from);
    const to = getNode(link.to);
    if (!from || !to) return;

    const points = getLinkPoints(from, to, link.fromPort || 'out');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'link-group' + (link.id === state.selectedLinkId ? ' selected' : ''));
    group.dataset.linkId = link.id;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'link-hit');
    hit.setAttribute('d', createPath(points.startX, points.startY, points.endX, points.endY));
    group.appendChild(hit);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'link-path');
    path.setAttribute('d', createPath(points.startX, points.startY, points.endX, points.endY));
    group.appendChild(path);

    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('class', 'link-node');
    head.setAttribute('cx', points.endX);
    head.setAttribute('cy', points.endY);
    head.setAttribute('r', '5.5');
    group.appendChild(head);

    if (link.fromPort && link.fromPort.startsWith('branch-')) {
      const idx = IFTHEN_PORTS.indexOf(link.fromPort);
      const branchText = idx >= 0 ? (normalizeBranchList(from.branches)[idx] || '').trim() : '';
      if (branchText) {
        const raw = branchText.length > 18 ? branchText.slice(0, 17) + '\u2026' : branchText;
        const labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelEl.setAttribute('class', 'link-label');
        labelEl.setAttribute('x', points.startX);
        labelEl.setAttribute('y', points.startY + 22);
        labelEl.setAttribute('text-anchor', 'middle');
        labelEl.textContent = raw;
        group.appendChild(labelEl);
      }
    }

    group.addEventListener('click', (event) => {
      event.stopPropagation();
      selectLink(link.id);
      renderSelectionStates();
      drawLinks();
      updateSelectionUi();
    });

    linkLayer.appendChild(group);
  });

  if (!state.connectDrag) return;
  const source = getNode(state.connectDrag.fromId);
  if (!source) return;

  const start = getOutPortPoint(source, state.connectDrag.fromPort || 'out');
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  preview.setAttribute('class', 'link-path preview');
  preview.setAttribute('d', createPath(start.x, start.y, state.connectDrag.x, state.connectDrag.y));
  linkLayer.appendChild(preview);
}

function renderSelectionStates() {
  nodeEls.forEach((el, id) => {
    el.classList.toggle('selected', id === state.selectedId);
    el.classList.toggle('connect-target', Boolean(state.connectDrag) && state.hoverTargetId === id && state.connectDrag.fromId !== id);
  });
}

function bringNodeToFront(nodeId) {
  const index = state.doc.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return;
  const node = state.doc.nodes.splice(index, 1)[0];
  state.doc.nodes.push(node);
}

function attachNodeEvents(el, node) {
  el.addEventListener('click', (event) => {
    if (event.target.closest('.node-port')) return;
    selectNode(node.id);
    renderSelectionStates();
    drawLinks();
    updateSelectionUi();
  });

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.node-port')) return;
    event.preventDefault();
    selectNode(node.id);
    bringNodeToFront(node.id);
    renderAll();

    const point = boardPointFromClient(event.clientX, event.clientY);
    state.dragNode = {
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y
    };

    const currentEl = nodeEls.get(node.id);
    if (currentEl) {
      currentEl.classList.add('dragging');
      currentEl.setPointerCapture(event.pointerId);
    }
  });

  el.querySelectorAll('.node-port--out').forEach((outPort) => {
    outPort.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const fromPort = outPort.dataset.port || 'out';
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
  selectionLabel.textContent = node
    ? TYPE_CONFIG[node.type].kicker.toUpperCase() + ' / ' + node.title.toUpperCase()
    : link
      ? getLinkSelectionLabel(link)
      : 'No Selection';

  inspectorHeading.textContent = node
    ? TYPE_CONFIG[node.type].kicker + ' Selected'
    : link
      ? 'Connection Selected'
      : 'Nothing Selected';
  const hasSelection = !!(node || link);
  objectCard.hidden = !hasSelection;
  inspectorContent.hidden = !hasSelection;
  behaviorCard.hidden = hasSelection;

  const NODE_COPY = {
    game: 'The root of the tour. Set the name, tagline, guide, price, and tags. Connect it downstream to the first Stop.',
    stop: 'A location on the tour. Write the SMS message players receive when they arrive. Connect to a Bubble, Ask, or the next Stop.',
    ask: 'Ask the player a question. Set the variable name to store their answer, enter up to 4 choices, and optionally mark one correct. Each choice routes to a different next step. Use {{varName}} in any Bubble to replay the answer.',
    bubble: 'A single SMS message from your guide. Write the message text below. Use {{varName}} to replay a captured player value.',
  };
  inspectorCopy.textContent = node
    ? (NODE_COPY[node.type] || 'Edit the selected object.')
    : link
      ? 'This connector is selected. Press Delete or use the button below to remove it.'
      : 'Select an object to edit it. Connections can fan out to more than one destination.';

  const isGameNode = !!node && node.type === 'game';
  const isStopNode = !!node && node.type === 'stop';
  const isAskNode = !!node && node.type === 'ask';
  const isLinkSelected = !!link;

  titleField.hidden = isLinkSelected || isStopNode || isAskNode || !node;
  stopNameField.hidden = isLinkSelected || !isStopNode;
  varNameField.hidden = isLinkSelected || !isAskNode;

  varValuesField.hidden = isLinkSelected || !isAskNode;
  descriptionField.hidden = isLinkSelected || !node || isAskNode;
  ifThenField.hidden = true;
  taglineField.hidden = isLinkSelected || !isGameNode;
  guideNameField.hidden = isLinkSelected || !isGameNode;
  priceField.hidden = isLinkSelected || !isGameNode;
  tagsField.hidden = isLinkSelected || !isGameNode;
  if (statsPanel) statsPanel.hidden = isLinkSelected;

  const BODY_LABELS = { game: 'Description', stop: 'Location Notes', bubble: 'SMS Message' };
  nodeTitleLabel.textContent = isGameNode ? 'GAME NAME' : node ? TYPE_CONFIG[node.type].kicker.toUpperCase() + ' NAME' : 'NAME';
  nodeBodyLabel.textContent = node ? (BODY_LABELS[node.type] || 'Notes') : 'Notes';

  nodeTitleInput.disabled = isStopNode || isAskNode || isLinkSelected || !node;
  stopNameInput.disabled = !isStopNode;
  varNameInput.disabled = !isAskNode;
  nodeTaglineInput.disabled = !isGameNode;
  nodeGuideNameInput.disabled = !isGameNode;
  nodePriceInput.disabled = !isGameNode;
  nodeTagNewInput.disabled = !isGameNode;
  nodeTagAddBtn.disabled = !isGameNode;
  nodeBodyInput.disabled = isLinkSelected || !node;
  ifThenBranchInputs.forEach((input) => {
    input.disabled = !isIfThenNode;
  });
  deleteBtn.disabled = !node && !link;
  deleteBtn.textContent = link ? 'Delete Connection' : 'Delete Object';

  nodeTitleInput.value = node && !isStopNode && !isAskNode ? node.title : '';
  stopNameInput.value = isStopNode && node ? node.title : '';
  varNameInput.value = isAskNode && node ? (node.varName || '') : '';

  const vals = normalizeVarValues(isAskNode && node ? node.varValues : []);
  const correctIdx = isAskNode && node ? node.varCorrect : null;
  varValueInputs.forEach((input, i) => { input.value = vals[i]; input.disabled = !isAskNode; });
  varCorrectRadios.forEach((radio, i) => {
    radio.checked = correctIdx === i;
    radio.disabled = !isAskNode;
  });
  nodeTaglineInput.value = isGameNode ? (node.tagline || '') : '';
  nodeGuideNameInput.value = isGameNode ? (node.guideName || '') : '';
  nodePriceInput.value = isGameNode ? (node.price || '') : '';
  nodeTagNewInput.value = '';
  renderTagPicker(node);
  nodeBodyInput.value = node ? (node.body || '') : '';
  incomingCount.textContent = String(node ? countLinks(node.id, 'to') : 0);
  outgoingCount.textContent = String(node ? countLinks(node.id, 'from') : 0);
  selectionId.textContent = node
    ? 'ID: ' + node.id
    : link
      ? 'LINK: ' + link.id
      : 'ID: none';
}

function addNode(type, x, y) {
  if (type === 'game' && hasGameNode()) {
    alert('Only one Game object is allowed per canvas.');
    return null;
  }
  const node = createNode(type, x, y);
  node.x = clamp(node.x, 36, board.clientWidth - node.width - 36);
  node.y = clamp(node.y, 36, board.clientHeight - node.height - 36);
  state.doc.nodes.push(node);
  selectNode(node.id);
  renderAll();
  return node;
}

function removeSelectedNode() {
  if (!state.selectedId) return;
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
  const rect = viewport.getBoundingClientRect();
  const centerPoint = boardPointFromClient(
    rect.left + (rect.width / 2),
    rect.top + (rect.height / 2)
  );
  const config = TYPE_CONFIG[type];
  const offset = (state.doc.nodes.length % 5) * 18;
  return addNode(
    type,
    centerPoint.x - (config.width / 2) + offset,
    centerPoint.y - (config.height / 2) + offset
  );
}

function updateHoverTarget(clientX, clientY) {
  const hit = document.elementFromPoint(clientX, clientY);
  const shell = hit && hit.closest ? hit.closest('.node-shell') : null;
  state.hoverTargetId = shell ? shell.dataset.id : null;
  renderSelectionStates();
}

function createLink(fromId, toId, fromPort = 'out') {
  if (!fromId || !toId || fromId === toId) return;
  const fromNode = getNode(fromId);
  const exists = state.doc.links.some((link) => link.from === fromId && link.to === toId && (link.fromPort || 'out') === fromPort);
  if (exists) return;

  if (fromNode && fromNode.type === 'ask') {
    state.doc.links = state.doc.links.filter((link) => !(link.from === fromId && (link.fromPort || 'out') === fromPort));
  }

  state.doc.links.push({
    id: 'link-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    from: fromId,
    to: toId,
    fromPort
  });
}

function stopConnectDrag(clientX, clientY) {
  if (!state.connectDrag) return;
  const hit = document.elementFromPoint(clientX, clientY);
  const shell = hit && hit.closest ? hit.closest('.node-shell') : null;
  const targetId = shell ? shell.dataset.id : null;
  if (targetId && targetId !== state.connectDrag.fromId) {
    createLink(state.connectDrag.fromId, targetId, state.connectDrag.fromPort || 'out');
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
  state.nextId = 1;
  syncAllTagsFromStore();
  renderGamePicker();
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
      varName: node.type === 'ask' ? (node.varName || '') : undefined,
      varValues: node.type === 'ask' ? normalizeVarValues(node.varValues) : undefined,
      varCorrect: node.type === 'ask' ? (node.varCorrect != null ? node.varCorrect : null) : undefined,
      tags: (node.tags || []).filter(Boolean),
      body: node.body
    })),
    links: state.doc.links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      fromPort: link.fromPort || 'out'
    }))
  };
}

function persistStoreLocally() {
  try {
    localStorage.setItem('tgb-games-new', JSON.stringify(state.store));
    if (state.currentGameId) localStorage.setItem('tgb-games-new-open', state.currentGameId);
    else localStorage.removeItem('tgb-games-new-open');
  } catch (error) {
  }
}

async function saveDoc() {
  const docPayload = serializeDoc();
  const savedGame = {
    id: state.currentGameId || makeGameId(),
    name: getDocName(docPayload),
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
  renderGamePicker();
  persistStoreLocally();

  try {
    if (API) {
      const res = await fetch(API + '/games-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.store)
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Save failed');
      }
      alert('Saved "' + savedGame.name + '" to play/data/games_new.json.');
      return;
    }

    alert('Saved "' + savedGame.name + '" in this browser only. Run the local Node server to write play/data/games_new.json.');
  } catch (error) {
    alert('Server save failed. Kept "' + savedGame.name + '" in this browser only.');
  }
}

async function loadDoc() {
  let nextStore = null;

  try {
    const urls = API ? [API + '/games', '../data/games.json'] : ['../data/games.json'];
    let res = null;
    for (const url of urls) {
      try { res = await fetch(url, { cache: 'no-store' }); if (res.ok) break; } catch (e) {}
    }
    if (res.ok) {
      const raw = await res.json();
      const legacy = Array.isArray(raw) ? raw : (Array.isArray(raw.games) ? raw.games : []);
      const converted = legacy
        .filter((g) => !g.archived)
        .map((g, i) => ({
          id: g.id || ('game-' + i),
          name: g.name || 'Untitled',
          updatedAt: g.updatedAt || '',
          nodes: [{
            id: 'node-1',
            type: 'game',
            x: 64, y: 64,
            width: TYPE_CONFIG.game.width,
            height: TYPE_CONFIG.game.height,
            title: g.name || 'Untitled',
            tagline: g.tagline || '',
            guideName: g.subtitle || '',
            price: g.price || '',
            tags: (g.tag || '').split(/[;,]/).map((t) => t.trim()).filter(Boolean),
            body: (g.description || '').replace(/<[^>]+>/g, '').trim(),
            varName: '',
            branches: []
          }],
          links: []
        }));
      if (converted.length > 0) {
        nextStore = { _comment: STORE_COMMENT, updatedAt: '', games: converted };
      }
    }
  } catch (error) {
  }

  state.store = nextStore || cloneObj(EMPTY_STORE);
  syncAllTagsFromStore();
  renderGamePicker();

  seedBoard();
}

function openSelectedGameFromPicker() {
  if (!openGameSelect.value) return;
  openSavedGame(openGameSelect.value);
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
  if (!node) return;
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
  if (!node || node.type !== 'ask') return;
  node.varName = varNameInput.value;
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
});

deleteBtn.addEventListener('click', () => {
  if (state.selectedLinkId) {
    removeSelectedLink();
    return;
  }
  removeSelectedNode();
});
saveBtn.addEventListener('click', saveDoc);
openGameBtn.addEventListener('click', openSelectedGameFromPicker);
openGameSelect.addEventListener('change', () => {
  openGameBtn.disabled = !openGameSelect.value;
});
openGameSelect.addEventListener('dblclick', openSelectedGameFromPicker);

newBoardBtn.addEventListener('click', () => {
  if (!confirm('Start a new canvas? This will replace the current graph in the editor until you reload or save.')) return;
  seedBoard();
});

zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - ZOOM_STEP));
zoomInBtn.addEventListener('click', () => setZoom(state.zoom + ZOOM_STEP));
zoomResetBtn.addEventListener('click', () => setZoom(1));

board.addEventListener('click', (event) => {
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
    node.x = snap(clamp(point.x - state.dragNode.offsetX, 36, board.clientWidth - node.width - 36));
    node.y = snap(clamp(point.y - state.dragNode.offsetY, 36, board.clientHeight - node.height - 36));
    positionNodeElement(node, el);
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
  if (state.stencilDrag) stopStencilDrag(event.clientX, event.clientY);

  if (state.dragNode) {
    const el = nodeEls.get(state.dragNode.id);
    if (el) el.classList.remove('dragging');
    state.dragNode = null;
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
  const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveDoc();
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
        addNodeToVisibleCanvas(btn.dataset.insert);
      });
    });
  }
}());

applyZoom();
loadDoc();
