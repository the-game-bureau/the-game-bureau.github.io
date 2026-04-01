(function (global) {
  const PREVIEW_KEY = 'tgb-play-current-game';

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function safeString(value) {
    return typeof value === 'string' ? value : '';
  }

  function getDeclaredVariableKeys(value) {
    const keys = [];
    String(value || '').replace(/%\s*([A-Za-z_]\w*)\s*%/g, function (_, key) {
      keys.push(key);
      return _;
    });
    return keys;
  }

  function normalizeVariableName(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed
      .replace(/^%+\s*/, '')
      .replace(/\s*%+$/, '')
      .trim();
  }

  function normalizeReplyMode(value) {
    return String(value || '').trim().toLowerCase() === 'guess'
      ? 'guess'
      : 'remember';
  }

  function normalizeFromPort(value) {
    return String(value || '').trim().toLowerCase() === 'out-bottom'
      ? 'out-bottom'
      : 'out-right';
  }

  function isVariableOnlyBody(value) {
    return /^%\s*([A-Za-z_]\w*)\s*%$/.test(String(value || '').trim());
  }

  function stripVariableMarkers(value) {
    return String(value || '')
      .replace(/%\s*([A-Za-z_]\w*)\s*%/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseExpectedReplies(value) {
    return String(value || '')
      .split(/\n|;|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function readStorageJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeGraphNode(raw) {
    const node = raw && typeof raw === 'object' ? raw : {};
    const type = safeString(node.type).trim() || 'stop';
    const body = safeString(node.body);
    const replyMode = type === 'reply' ? normalizeReplyMode(node.replyMode) : '';
    const explicitVarName = normalizeVariableName(node.varName);
    const legacyVarKeys = getDeclaredVariableKeys(body);
    const varName = explicitVarName || (legacyVarKeys.length === 1 ? legacyVarKeys[0] : '');
    return {
      id: safeString(node.id).trim(),
      type,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      title: safeString(node.title),
      tagline: safeString(node.tagline),
      guideName: safeString(node.guideName),
      price: safeString(node.price),
      tags: Array.isArray(node.tags) ? node.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      body: type === 'reply' && !explicitVarName && isVariableOnlyBody(body) ? '' : body,
      varName: varName,
      replyMode: replyMode,
      acceptAny: type === 'reply' ? !!node.acceptAny : false,
      anytime: !!node.anytime,
      anytimePairId: safeString(node.anytimePairId || node.pairId).trim(),
      buttonUrl: safeString(node.buttonUrl).trim()
    };
  }

  function normalizeGraphLink(raw, index) {
    const link = raw && typeof raw === 'object' ? raw : {};
    return {
      id: safeString(link.id).trim() || ('link-' + index),
      from: safeString(link.from).trim(),
      to: safeString(link.to).trim(),
      fromPort: normalizeFromPort(link.fromPort)
    };
  }

  function normalizeGraphGame(raw) {
    const game = raw && typeof raw === 'object' ? raw : {};
    const nodes = Array.isArray(game.nodes) ? game.nodes.map(normalizeGraphNode).filter((node) => node.id) : [];
    const links = Array.isArray(game.links) ? game.links.map(normalizeGraphLink).filter((link) => link.from && link.to) : [];
    const gameNode = nodes.find((node) => node.type === 'game') || null;
    const fallbackName = gameNode && gameNode.title.trim() ? gameNode.title.trim() : 'Untitled Game';
    return {
      id: safeString(game.id).trim() || slugify(game.name || fallbackName) || 'untitled-game',
      name: safeString(game.name).trim() || fallbackName,
      createdAt: safeString(game.createdAt),
      updatedAt: safeString(game.updatedAt),
      primaryColor: safeString(game.primaryColor || game.primary_color).trim(),
      secondaryColor: safeString(game.secondaryColor || game.secondary_color).trim(),
      nodes,
      links
    };
  }

  function matchesGraphGame(game, query) {
    const target = slugify(query);
    if (!target || !game) return false;
    const root = getGameNode(game);
    return target === slugify(game.id)
      || target === slugify(game.name)
      || target === slugify(root && root.title);
  }

  function getSupabaseCfg() {
    return (window.TGB_SUPABASE_CONFIG && window.TGB_SUPABASE_CONFIG.enabled)
      ? window.TGB_SUPABASE_CONFIG : null;
  }

  async function fetchGameFromSupabase(query) {
    const cfg = getSupabaseCfg();
    if (!cfg || !query) return null;
    const headers = {
      apikey: cfg.publishableKey,
      Authorization: 'Bearer ' + cfg.publishableKey,
      Accept: 'application/json'
    };
    // Try by exact ID first
    try {
      const byId = new URL('/rest/v1/' + encodeURIComponent(cfg.gamesTable), cfg.url + '/');
      byId.searchParams.set('select', 'id,name,primary_color,secondary_color,nodes,links');
      byId.searchParams.set('id', 'eq.' + query);
      byId.searchParams.set('limit', '1');
      const res = await fetch(byId.toString(), { cache: 'no-store', headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) return rows[0];
      }
    } catch (e) {}
    // Try by exact name (case-insensitive)
    try {
      const byName = new URL('/rest/v1/' + encodeURIComponent(cfg.gamesTable), cfg.url + '/');
      byName.searchParams.set('select', 'id,name,primary_color,secondary_color,nodes,links');
      byName.searchParams.set('name', 'ilike.' + query);
      byName.searchParams.set('limit', '1');
      const res = await fetch(byName.toString(), { cache: 'no-store', headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) return rows[0];
      }
    } catch (e) {}
    return null;
  }

  function readPreviewGame() {
    const raw = readStorageJson(sessionStorage, PREVIEW_KEY);
    if (!raw) return null;
    const game = raw && raw.game ? raw.game : raw;
    if (!game || typeof game !== 'object') return null;
    return normalizeGraphGame(game);
  }

  async function loadGraphGame(query) {
    const requested = safeString(query).trim();
    if (requested) {
      const preview = readPreviewGame();
      if (preview && matchesGraphGame(preview, requested)) return preview;
    }

    // Try Supabase when a query is given
    if (requested) {
      const sbRow = await fetchGameFromSupabase(requested);
      if (sbRow) return normalizeGraphGame(sbRow);
    }

    return null;
  }

  function getGameNode(game) {
    const nodes = game && Array.isArray(game.nodes) ? game.nodes : [];
    return nodes.find((node) => node.type === 'game') || null;
  }

  function getGameQueryValue(game) {
    return game && game.name ? game.name : (game && game.id ? game.id : '');
  }

  function compareNodesByPosition(a, b) {
    const topDiff = (Number(a && a.y) || 0) - (Number(b && b.y) || 0);
    if (topDiff !== 0) return topDiff;
    const leftDiff = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
    if (leftDiff !== 0) return leftDiff;
    return String(a && a.id || '').localeCompare(String(b && b.id || ''));
  }

  function buildLookup(game) {
    const nodes = new Map();
    const outgoing = new Map();
    const incoming = new Map();
    const links = Array.isArray(game && game.links) ? game.links : [];

    (game && Array.isArray(game.nodes) ? game.nodes : []).forEach((node) => {
      if (!node.id) return;
      nodes.set(node.id, node);
    });

    links.forEach((link, index) => {
      if (!nodes.has(link.from) || !nodes.has(link.to)) return;
      const outList = outgoing.get(link.from) || [];
      outList.push({ to: link.to, index, fromPort: normalizeFromPort(link.fromPort) });
      outgoing.set(link.from, outList);

      const inList = incoming.get(link.to) || [];
      inList.push({ from: link.from, index });
      incoming.set(link.to, inList);
    });

    return { nodes, outgoing, incoming };
  }

  function getOrderedOutgoingIds(lookup, nodeId) {
    const edges = lookup.outgoing.get(nodeId) || [];
    return edges
      .slice()
      .sort((a, b) => {
        const nodeA = lookup.nodes.get(a.to);
        const nodeB = lookup.nodes.get(b.to);
        const typeWeightA = nodeA && nodeA.type === 'stop' ? 1 : 0;
        const typeWeightB = nodeB && nodeB.type === 'stop' ? 1 : 0;
        if (typeWeightA !== typeWeightB) return typeWeightA - typeWeightB;
        const layoutDiff = compareNodesByPosition(nodeA, nodeB);
        if (layoutDiff !== 0) return layoutDiff;
        return a.index - b.index;
      })
      .map((edge) => edge.to);
  }

  function getOrderedOutgoingEdges(lookup, nodeId) {
    const edges = lookup.outgoing.get(nodeId) || [];
    return edges
      .slice()
      .sort((a, b) => {
        const nodeA = lookup.nodes.get(a.to);
        const nodeB = lookup.nodes.get(b.to);
        const typeWeightA = nodeA && nodeA.type === 'stop' ? 1 : 0;
        const typeWeightB = nodeB && nodeB.type === 'stop' ? 1 : 0;
        if (typeWeightA !== typeWeightB) return typeWeightA - typeWeightB;
        const layoutDiff = compareNodesByPosition(nodeA, nodeB);
        if (layoutDiff !== 0) return layoutDiff;
        return a.index - b.index;
      });
  }

  function getReplyBranchEdge(lookup, replyNode, preferredPort) {
    const edges = getOrderedOutgoingEdges(lookup, replyNode.id);
    const exact = edges.find((edge) => normalizeFromPort(edge.fromPort) === preferredPort);
    if (exact) return exact;

    const replyX = Number(replyNode && replyNode.x) || 0;
    const replyY = Number(replyNode && replyNode.y) || 0;
    if (preferredPort === 'out-bottom') {
      return edges.find((edge) => {
        const node = lookup.nodes.get(edge.to);
        return node && (Number(node.y) || 0) > replyY + 12;
      }) || null;
    }
    return edges.find((edge) => {
      const node = lookup.nodes.get(edge.to);
      return node && (Number(node.x) || 0) > replyX + 12 && Math.abs((Number(node.y) || 0) - replyY) <= 54;
    }) || edges[0] || null;
  }

  function buildGuessBranchOutcome(targetId, lookup, stopId) {
    const target = targetId ? lookup.nodes.get(targetId) : null;
    if (!target) return null;
    if (target.type === 'stop') {
      return {
        reply: '',
        goToBubbleId: '',
        goToStopId: target.id && target.id !== stopId ? target.id : '',
        walkStartIds: []
      };
    }
    return {
      reply: '',
      goToBubbleId: target.id,
      goToStopId: '',
      walkStartIds: [target.id]
    };
  }

  function getInlineIncorrectReply(targetId, lookup) {
    const target = targetId ? lookup.nodes.get(targetId) : null;
    if (!target) return '';
    if (target.type === 'bubble') return safeString(target.body).trim();
    if (target.type === 'stop') return safeString(target.title).trim();
    return '';
  }

  function getBranchAnswersFromReplyNode(node) {
    if (!node || node.type !== 'reply') return [];
    return parseExpectedReplies(stripVariableMarkers(node.body));
  }

  function getReplyBranchRule(replyNodeId, lookup, stopId) {
    const replyNode = lookup.nodes.get(replyNodeId);
    const answers = getBranchAnswersFromReplyNode(replyNode);
    if (!answers.length) return null;

    const childIds = getOrderedOutgoingIds(lookup, replyNodeId);
    const firstChildId = childIds[0];
    const firstChild = firstChildId ? lookup.nodes.get(firstChildId) : null;
    if (!firstChild) return null;

    let reply = '';
    let goToBubbleId = '';
    let goToStopId = '';
    const walkStartIds = [];

    if (firstChild.type === 'stop') {
      if (firstChild.id && firstChild.id !== stopId) goToStopId = firstChild.id;
    } else if (firstChild.type === 'bubble') {
      const feedback = safeString(firstChild.body).trim();
      const nextIds = getOrderedOutgoingIds(lookup, firstChild.id);
      const nextChildId = nextIds[0] || '';
      const nextChild = nextChildId ? lookup.nodes.get(nextChildId) : null;

      if (feedback) {
        reply = feedback;
        if (nextChild) {
          if (nextChild.type === 'stop') {
            if (nextChild.id && nextChild.id !== stopId) goToStopId = nextChild.id;
          } else {
            goToBubbleId = nextChild.id;
          }
        }
      } else {
        goToBubbleId = firstChild.id;
        walkStartIds.push(firstChild.id);
      }
    } else {
      goToBubbleId = firstChild.id;
      walkStartIds.push(firstChild.id);
    }

    if (!reply && !goToBubbleId && !goToStopId) return null;
    return {
      answers,
      reply,
      goToBubbleId,
      goToStopId,
      walkStartIds
    };
  }

  function buildBranchReplyNode(replyNodeIds, lookup, stopId, sourceNodeId) {
    const storesAs = normalizeVariableName(
      replyNodeIds
        .map((replyNodeId) => {
          const replyNode = lookup.nodes.get(replyNodeId);
          return replyNode ? replyNode.varName : '';
        })
        .find(Boolean) || ''
    );
    const rules = replyNodeIds
      .map((replyNodeId) => getReplyBranchRule(replyNodeId, lookup, stopId))
      .filter(Boolean);
    const branches = rules.map((rule) => ({
      answers: rule.answers,
      goToBubbleId: rule.goToBubbleId || '',
      goToStopId: rule.goToStopId || '',
      reply: rule.reply || ''
    }));
    const walkStartIds = rules.flatMap((rule) => rule.walkStartIds || []);

    if (!branches.length) return null;
    return {
      node: {
        id: String(sourceNodeId || stopId || 'branch') + '__branch',
        type: 'reply',
        body: '',
        varName: storesAs,
        replyMode: 'branch',
        branches
      },
      walkStartIds
    };
  }

  function buildGuessReplyNode(replyNode, lookup, stopId) {
    const answers = getBranchAnswersFromReplyNode(replyNode);
    if (!answers.length) return null;

    const correctEdge = getReplyBranchEdge(lookup, replyNode, 'out-right');
    const incorrectEdge = getReplyBranchEdge(lookup, replyNode, 'out-bottom');
    const correctOutcome = correctEdge ? buildGuessBranchOutcome(correctEdge.to, lookup, stopId) : null;
    const incorrectReply = incorrectEdge ? getInlineIncorrectReply(incorrectEdge.to, lookup) : '';

    if (!correctOutcome && !incorrectReply) return null;

    return {
      node: {
        id: replyNode.id,
        type: 'reply',
        body: '',
        varName: normalizeVariableName(replyNode.varName),
        replyMode: 'branch',
        incorrectReply,
        branches: correctOutcome ? [{
          answers,
          goToBubbleId: correctOutcome.goToBubbleId || '',
          goToStopId: correctOutcome.goToStopId || '',
          reply: correctOutcome.reply || ''
        }] : []
      },
      walkStartIds: correctOutcome ? (correctOutcome.walkStartIds || []) : []
    };
  }

  function shouldCompileGuessBranch(replyNode, lookup) {
    if (!replyNode || replyNode.type !== 'reply') return false;
    if (!getBranchAnswersFromReplyNode(replyNode).length) return false;
    return !!(getReplyBranchEdge(lookup, replyNode, 'out-right') || getReplyBranchEdge(lookup, replyNode, 'out-bottom'));
  }

  function buildStopConversation(stopId, lookup) {
    const visited = new Set();
    const addedMessageIds = new Set();
    const messages = [];
    const nextStopIds = [];

    function rememberNextStop(nodeId) {
      const stopNode = lookup.nodes.get(nodeId);
      if (!stopNode || stopNode.type !== 'stop' || stopNode.id === stopId || nextStopIds.includes(stopNode.id)) return;
      nextStopIds.push(stopNode.id);
    }

    function addMessage(node) {
      if (!node || !node.id || addedMessageIds.has(node.id)) return;
      addedMessageIds.add(node.id);
      messages.push(node);
    }

    function walk(nodeId) {
      const node = lookup.nodes.get(nodeId);
      if (!node) return;
      if (node.type === 'stop') {
        rememberNextStop(nodeId);
        return;
      }
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      if (node.type === 'reply' && shouldCompileGuessBranch(node, lookup)) {
        const guessBranch = buildGuessReplyNode(node, lookup, stopId);
        if (guessBranch && guessBranch.node) {
          addMessage(guessBranch.node);
          (guessBranch.walkStartIds || []).forEach((walkStartId) => {
            const walkStartNode = lookup.nodes.get(walkStartId);
            if (!walkStartNode) return;
            if (walkStartNode.type === 'stop') rememberNextStop(walkStartId);
            else walk(walkStartId);
          });
          return;
        }
      }
      if (node.type === 'bubble' || node.type === 'reply' || node.type === 'button') addMessage(node);

      const childIds = getOrderedOutgoingIds(lookup, nodeId);
      if (node.type === 'bubble') {
        const replyChildren = childIds.filter((childId) => {
          const child = lookup.nodes.get(childId);
          return child && child.type === 'reply';
        });
        if (replyChildren.length > 1) {
          const branchResult = buildBranchReplyNode(replyChildren, lookup, stopId, node.id);
          if (branchResult && branchResult.node) addMessage(branchResult.node);

          childIds.forEach((childId) => {
            const child = lookup.nodes.get(childId);
            if (!child) return;
            if (child.type === 'reply') return;
            if (child.type === 'stop') rememberNextStop(childId);
            else walk(childId);
          });

          if (branchResult) {
            branchResult.walkStartIds.forEach((walkStartId) => {
              const walkStartNode = lookup.nodes.get(walkStartId);
              if (!walkStartNode) return;
              if (walkStartNode.type === 'stop') rememberNextStop(walkStartId);
              else walk(walkStartId);
            });
          }
          return;
        }
      }

      childIds.forEach((childId) => {
        const child = lookup.nodes.get(childId);
        if (!child) return;
        if (child.type === 'stop') rememberNextStop(childId);
        else walk(childId);
      });
    }

    getOrderedOutgoingIds(lookup, stopId).forEach((childId) => {
      const child = lookup.nodes.get(childId);
      if (!child) return;
      if (child.type === 'stop') rememberNextStop(childId);
      else walk(childId);
    });

    return {
      messages,
      nextStopId: nextStopIds[0] || ''
    };
  }

  function buildOrderedStops(game) {
    const lookup = buildLookup(game);
    const allStops = Array.from(lookup.nodes.values())
      .filter((node) => node.type === 'stop')
      .sort(compareNodesByPosition);
    const ordered = [];
    const visitedStops = new Set();
    const queue = [];

    function enqueue(stopId) {
      if (!stopId || visitedStops.has(stopId) || queue.includes(stopId)) return;
      const stop = lookup.nodes.get(stopId);
      if (!stop || stop.type !== 'stop') return;
      queue.push(stopId);
    }

    const gameNode = getGameNode(game);
    if (gameNode) {
      getOrderedOutgoingIds(lookup, gameNode.id).forEach((childId) => {
        const child = lookup.nodes.get(childId);
        if (child && child.type === 'stop') enqueue(child.id);
      });
    }
    if (!queue.length && allStops[0]) enqueue(allStops[0].id);

    while (true) {
      while (queue.length) {
        const stopId = queue.shift();
        if (visitedStops.has(stopId)) continue;
        const stop = lookup.nodes.get(stopId);
        if (!stop || stop.type !== 'stop') continue;
        visitedStops.add(stopId);
        const conversation = buildStopConversation(stopId, lookup);
        ordered.push({
          stop,
          messages: conversation.messages,
          nextStopId: conversation.nextStopId
        });
        enqueue(conversation.nextStopId);
      }
      const nextStop = allStops.find((stop) => !visitedStops.has(stop.id));
      if (!nextStop) break;
      enqueue(nextStop.id);
    }

    return ordered;
  }

  function getAnytimeResponseNode(replyNode, lookup) {
    if (!replyNode || replyNode.type !== 'reply' || !replyNode.anytime) return null;
    const pairId = safeString(replyNode.anytimePairId).trim();
    const linkedChild = getOrderedOutgoingIds(lookup, replyNode.id)
      .map((childId) => lookup.nodes.get(childId))
      .find((child) => child && child.type === 'bubble' && (!pairId || safeString(child.anytimePairId).trim() === pairId));
    if (linkedChild) return linkedChild;
    if (!pairId) return null;
    return Array.from(lookup.nodes.values()).find((node) =>
      node
      && node.type === 'bubble'
      && !!node.anytime
      && safeString(node.anytimePairId).trim() === pairId
    ) || null;
  }

  function buildAnytimeStops(game) {
    const lookup = buildLookup(game);
    return Array.from(lookup.nodes.values())
      .filter((node) => node && node.type === 'reply' && !!node.anytime)
      .sort(compareNodesByPosition)
      .map((replyNode) => {
        const responseNode = getAnytimeResponseNode(replyNode, lookup);
        const responseMessage = responseNode ? toEngineMessage(responseNode) : null;
        return {
          id: replyNode.id + '__anytime',
          title: '',
          notes: '',
          messages: responseMessage ? [responseMessage] : [],
          playerReply: {
            type: 'text',
            anytime: true,
            placeholder: '',
            answers: getBranchAnswersFromReplyNode(replyNode),
            storesAs: normalizeVariableName(replyNode.varName)
          }
        };
      });
  }

  function toEngineMessage(node) {
    const body = safeString(node && node.body).trim();
    if (node.type === 'button') {
      const label = safeString(node && node.title).trim() || 'BUY GAME TO CONTINUE';
      const url = safeString(node && node.buttonUrl).trim();
      return {
        isButton: true,
        text: label,
        buttonUrl: url,
        bubbleId: node.id
      };
    }
    if (node.type === 'reply') {
      const replyModeRaw = String(node && node.replyMode || '').trim().toLowerCase();
      if (replyModeRaw === 'branch') {
        return {
          replyExpected: 'branch',
          incorrectReply: safeString(node && node.incorrectReply).trim(),
          storesAs: normalizeVariableName(node && node.varName),
          branches: Array.isArray(node && node.branches)
              ? node.branches.map((branch) => ({
                  answers: Array.isArray(branch && branch.answers) ? branch.answers : parseExpectedReplies(branch && branch.answers),
                  goToBubbleId: safeString(branch && branch.goToBubbleId).trim(),
                  goToStopId: safeString(branch && branch.goToStopId).trim(),
                  reply: safeString(branch && branch.reply).trim()
                }))
            : [],
          bubbleId: node.id
        };
      }
      const explicitVarName = normalizeVariableName(node && node.varName);
      if (node.acceptAny || !body) {
        return {
          text: explicitVarName || '',
          fromPlayer: true,
          replyExpected: 'any',
          placeholder: '',
          storesAs: explicitVarName,
          bubbleId: node.id
        };
      }
      const guessText = stripVariableMarkers(body);
      return {
        text: guessText || 'Reply',
        fromPlayer: true,
        storesAs: explicitVarName,
        answers: guessText || '',
        placeholder: '',
        bubbleId: node.id
      };
    }
    if (!body) return null;
    return {
      html: body,
      bubbleId: node.id
    };
  }

  function buildLandingData(game) {
    const gameNode = getGameNode(game);
    const name = gameNode && gameNode.title.trim() ? gameNode.title.trim() : (game && game.name ? game.name : 'Untitled Game');
    return {
      id: game && game.id ? game.id : '',
      name,
      subtitle: gameNode ? safeString(gameNode.guideName).trim() : '',
      price: gameNode ? safeString(gameNode.price).trim() : '',
      description: gameNode ? safeString(gameNode.body).trim() : '',
      tagline: gameNode ? safeString(gameNode.tagline).trim() : '',
      tags: gameNode && Array.isArray(gameNode.tags) ? gameNode.tags.filter(Boolean) : [],
      query: getGameQueryValue(game)
    };
  }

  function buildEnginePayload(game) {
    const gameNode = getGameNode(game);
    const title = gameNode && gameNode.title.trim() ? gameNode.title.trim() : (game && game.name ? game.name : 'Untitled Game');
    const anytimeStops = buildAnytimeStops(game);
    const orderedStops = buildOrderedStops(game);

    return {
      header: {
        title,
        subtitle: gameNode ? safeString(gameNode.guideName).trim() : '',
        pageTitle: title,
        status: 'online',
        primaryColor: safeString(game && game.primaryColor).trim(),
        tertiaryColor: gameNode ? safeString(gameNode.tertiaryColor).trim() : '',
        logoUrl: gameNode ? safeString(gameNode.logoUrl).trim() : '',
        guideImageUrl: gameNode ? safeString(gameNode.guideImageUrl).trim() : ''
      },
      startIndex: anytimeStops.length,
      routes: [],
      stops: anytimeStops.concat(orderedStops.map((entry) => ({
        id: entry.stop.id,
        title: safeString(entry.stop.title).trim(),
        notes: safeString(entry.stop.body),
        messages: entry.messages.map(toEngineMessage).filter(Boolean),
        playerReply: {
          type: 'text',
          placeholder: '',
          answers: []
        }
      })))
    };
  }

  global.TGBGamesNewRuntime = {
    slugify,
    loadGraphGame,
    getGameQueryValue,
    buildLandingData,
    buildEnginePayload
  };
})(window);
