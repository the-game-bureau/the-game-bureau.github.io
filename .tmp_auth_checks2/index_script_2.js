
    const SUPABASE_CONFIG = {
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
    };

    const GAMES_SCHEMA = {
      tagline: true,
      featured: true,
      game_date: true
    };

    const signOutBtn = document.getElementById('signOutBtn');
    const libraryStatus = document.getElementById('libraryStatus');
    const gameGrid = document.getElementById('gameGrid');
    const libNewBtn = document.getElementById('libNewBtn');
    const libSelectAllBtn = document.getElementById('libSelectAllBtn');
    const libSelectAllBtnLabel = libSelectAllBtn.querySelector('.btn-label');
    const libViewBtn = document.getElementById('libViewBtn');
    const libEditBtn = document.getElementById('libEditBtn');
    const libDupBtn = document.getElementById('libDupBtn');
    const libArchBtn = document.getElementById('libArchBtn');
    const libArchBtnLabel = libArchBtn.querySelector('.btn-label');
    const libFeatureBtn = document.getElementById('libFeatureBtn');
    const libFeatureBtnLabel = libFeatureBtn.querySelector('.btn-label');
    const libSearchInput = document.getElementById('libSearchInput');
    const adminAuth = window.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      signOutButton: signOutBtn,
      onAuthorized: async () => {
        await loadAdminLibrary();
      },
      onSignedOut: () => {
        selectedGames.clear();
        allGamesData = [];
        visibleGamesData = [];
        lastSelectedId = null;
        gameGrid.innerHTML = '';
        updateToolbar();
        renderLibraryEmpty('Sign in with an admin account.');
        setStatus(libraryStatus, '');
      }
    });

    const selectedGames = new Map();
    let allGamesData = [];
    let visibleGamesData = [];
    let searchTerm = '';
    let lastSelectedId = null;

    function formatGameDate(game) {
      const raw = String(game && game.game_date || '').trim();
      if (!raw) return '';
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return raw;
      const [, year, month, day] = match;
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (Number.isNaN(date.getTime())) return raw;
      return date.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    function applySearchFilter(games) {
      if (!searchTerm) return games;
      return games.filter((g) => {
        const haystack = (String(g && g.name || '') + ' ' + formatGameDate(g) + ' ' + String(g && g.game_date || '')).toLowerCase();
        return haystack.includes(searchTerm);
      });
    }

    libSearchInput.addEventListener('input', () => {
      searchTerm = libSearchInput.value.toLowerCase().trim();
      renderAdminLibrary(allGamesData);
    });

    function restUrl(table, params = {}) {
      const url = new URL('/rest/v1/' + encodeURIComponent(table), SUPABASE_CONFIG.url + '/');
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    }

    function buildBuilderRoute(params = {}) {
      const builderParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          builderParams.set(key, String(value));
        }
      });
      const search = builderParams.toString();
      return 'builder.html' + (search ? '?' + search : '');
    }

    function buildRunRoute(params = {}) {
      const runParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          runParams.set(key, String(value));
        }
      });
      const search = runParams.toString();
      return '../game/run/index.html' + (search ? '?' + search : '');
    }

    function setStatus(el, message, state = '') {
      if (!el) return;
      el.textContent = message || '';
      el.classList.toggle('error', state === 'error');
      el.classList.toggle('success', state === 'success');
    }

    async function readError(response, fallback) {
      try {
        const text = await response.text();
        if (!text) return fallback;
        try {
          const payload = JSON.parse(text);
          const message = payload.message || payload.msg || payload.error_description || payload.error || text;
          if (/public\.admin_users|admin_users/i.test(message) && /schema cache|could not find/i.test(message)) {
            return 'Admin access is not set up yet. Run docs/supabase/photo-submissions.sql in Supabase, then add your email to public.admin_users.';
          }
          return message;
        } catch (error) {
          return text;
        }
      } catch (error) {
        return fallback;
      }
    }

    function authHeaders(extra = {}) {
      return adminAuth.authHeaders(extra);
    }

    function getMissingGamesColumnName(errorMessage = '') {
      const message = String(errorMessage || '');
      const match = message.match(/column\s+games\.([a-z_]+)\s+does\s+not\s+exist/i);
      if (match) return String(match[1] || '').trim().toLowerCase();
      const schemaMatch = message.match(/could not find the ['"]?([a-z_]+)['"]? column of ['"]?games/i);
      return schemaMatch ? String(schemaMatch[1] || '').trim().toLowerCase() : '';
    }

    function buildGameSelect() {
      const columns = [
        'id',
        'name',
        'primary_color',
        'secondary_color',
        'city',
        'archived',
        'tags',
        'body',
        'logo_url',
        'guide_image_url'
      ];
      if (GAMES_SCHEMA.featured) columns.splice(5, 0, 'featured');
      if (GAMES_SCHEMA.tagline) columns.splice(2, 0, 'tagline');
      if (GAMES_SCHEMA.game_date) columns.push('game_date');
      return columns.join(',');
    }

    async function fetchGames(selectOverride = '') {
      const response = await fetch(restUrl('games', {
        select: selectOverride || buildGameSelect(),
        order: 'name.asc'
      }), {
        headers: authHeaders({ Accept: 'application/json' }),
        cache: 'no-store'
      });

      if (!response.ok) {
        const message = await readError(response, 'Could not load games.');
        const missingColumn = getMissingGamesColumnName(message);
        if (missingColumn === 'tagline' && GAMES_SCHEMA.tagline) {
          GAMES_SCHEMA.tagline = false;
          return fetchGames(buildGameSelect());
        }
        if (missingColumn === 'featured' && GAMES_SCHEMA.featured) {
          GAMES_SCHEMA.featured = false;
          return fetchGames(buildGameSelect());
        }
        if (missingColumn === 'game_date' && GAMES_SCHEMA.game_date) {
          GAMES_SCHEMA.game_date = false;
          return fetchGames(buildGameSelect());
        }
        throw new Error(message);
      }

      return response.json();
    }

    function isFilledArchiveValue(value) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        return !!trimmed && trimmed !== 'false' && trimmed !== '0' && trimmed !== 'no';
      }
      return !!value;
    }

    function isLiveGame(game) {
      return !isFilledArchiveValue(game && game.archived);
    }

    function getGameState(game) {
      if (isFilledArchiveValue(game && game.archived)) return 'archived';
      return 'live';
    }

    function getGamePalette(game) {
      return {
        primary: String(game && (game.primary_color || game.primaryColor) || '').trim() || '#2d4880',
        secondary: String(game && (game.secondary_color || game.secondaryColor) || '').trim() || 'rgba(45,72,128,0.72)'
      };
    }

    function resolveAdminAssetUrl(value) {
      const raw = String(value || '').trim().replace(/\\/g, '/')
        .replace('https://the-game-bureau.github.io/the-game-bureau/', 'https://thegamebureau.com/')
        .replace('https://the-game-bureau.github.io/', 'https://thegamebureau.com/');
      if (!raw) return '';
      if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
      try {
        const base = /^assets\//i.test(raw) ? new URL('../', window.location.href).toString() : window.location.href;
        const resolved = new URL(raw, base);
        const protocol = String(resolved.protocol || '').toLowerCase();
        return protocol === 'http:' || protocol === 'https:' || protocol === 'file:' ? resolved.toString() : '';
      } catch (error) {
        return '';
      }
    }

    function getGameImageUrl(game) {
      return resolveAdminAssetUrl(game && (
        game.logo_url ||
        game.logoUrl ||
        game.logo ||
        game.guide_image_url ||
        game.guideImageUrl
      ) || '');
    }

    function getGameMonogram(game) {
      const title = String(game && game.name || 'Game').trim();
      const words = title.match(/[A-Za-z0-9]+/g) || [];
      if (words.length >= 2) return ((words[0][0] || '') + (words[1][0] || '')).toUpperCase();
      return title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'TG';
    }

    function getGameCaption(game) {
      const tagline = String(game && game.tagline || '').replace(/\s+/g, ' ').trim();
      const body = String(game && game.body || '').replace(/\s+/g, ' ').trim();
      const caption = tagline || body || 'A live local experience by The Game Bureau.';
      return caption.length > 100 ? caption.slice(0, 97).trimEnd() + '...' : caption;
    }

    function isGameFeatured(game) {
      const featuredField = game && game.featured;
      if (typeof featuredField === 'boolean') return featuredField;
      if (typeof featuredField === 'string' && featuredField.trim()) return true;
      const tags = Array.isArray(game && game.tags) ? game.tags : [];
      return tags.some((tag) => String(tag || '').trim().toLowerCase() === 'featured');
    }

    function sortGamesForAdminLibrary(games) {
      const stateOrder = { live: 0, archived: 1 };
      return [...games].sort((left, right) => {
        const stateDelta = stateOrder[getGameState(left)] - stateOrder[getGameState(right)];
        if (stateDelta !== 0) return stateDelta;
        const featuredDelta = Number(isGameFeatured(right)) - Number(isGameFeatured(left));
        if (featuredDelta !== 0) return featuredDelta;
        return String(left && left.name || 'Untitled Game').localeCompare(
          String(right && right.name || 'Untitled Game'),
          undefined,
          { sensitivity: 'base' }
        );
      });
    }

    function renderLibraryEmpty(message) {
      gameGrid.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = message;
      gameGrid.appendChild(empty);
    }

    function createAdminGameCard(game) {
      const gameId = String(game && game.id || '').trim();
      const palette = getGamePalette(game);
      const state = getGameState(game);
      const card = document.createElement('article');
      card.className = 'admin-game-card';
      if (state !== 'live') card.classList.add('is-' + state);
      card.style.setProperty('--game-primary', palette.primary);
      card.style.setProperty('--game-secondary', palette.secondary);

      const media = document.createElement('div');
      media.className = 'admin-game-media';

      const monogram = document.createElement('div');
      monogram.className = 'admin-game-monogram';
      monogram.textContent = getGameMonogram(game);
      media.appendChild(monogram);

      const imageUrl = getGameImageUrl(game);
      media.dataset.hasImage = imageUrl ? 'true' : 'false';
      if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'admin-game-image';
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          image.remove();
          media.dataset.hasImage = 'false';
        });
        media.appendChild(image);
      }

      if (isGameFeatured(game)) {
        const badge = document.createElement('div');
        badge.className = 'admin-game-badge';
        badge.textContent = 'Featured';
        media.appendChild(badge);
      }

      if (state !== 'live') {
        const statusBadge = document.createElement('div');
        statusBadge.className = 'admin-game-status ' + state;
        statusBadge.textContent = state;
        media.appendChild(statusBadge);
      }

      const body = document.createElement('div');
      body.className = 'admin-game-body';

      const eyebrow = document.createElement('p');
      eyebrow.className = 'admin-game-eyebrow';
      eyebrow.textContent = String(game && game.city || '').trim() || gameId || 'Game';

      const title = document.createElement('h3');
      title.className = 'admin-game-title';
      title.textContent = String(game && game.name || '').trim() || 'Untitled Game';

      body.append(eyebrow, title);

      const dateLabel = formatGameDate(game);
      if (dateLabel) {
        const dateEl = document.createElement('p');
        dateEl.className = 'admin-game-date';
        dateEl.textContent = dateLabel;
        body.appendChild(dateEl);
      }
      card.append(media, body);
      card.dataset.gameId = gameId;
      card.dataset.gameState = state;
      card.addEventListener('mousedown', (event) => {
        if (event.shiftKey) event.preventDefault();
      });
      card.addEventListener('click', (event) => selectGame(game, event));
      return card;
    }

    function renderAdminLibrary(games) {
      allGamesData = Array.isArray(games) ? games : [];
      const sortedAll = sortGamesForAdminLibrary(allGamesData);
      visibleGamesData = applySearchFilter(sortedAll);

      const gamesById = new Map(allGamesData.map((g) => [String(g.id), g]));
      for (const id of [...selectedGames.keys()]) {
        const fresh = gamesById.get(String(id));
        if (fresh) selectedGames.set(id, fresh);
        else selectedGames.delete(id);
      }
      updateToolbar();
      gameGrid.innerHTML = '';

      if (!allGamesData.length) {
        renderLibraryEmpty('No games found.');
        setStatus(libraryStatus, 'No games found.');
        return;
      }

      if (!visibleGamesData.length) {
        renderLibraryEmpty('No games match “' + searchTerm + '”.');
        renderLibraryStatusLine();
        return;
      }

      visibleGamesData.forEach((game) => {
        const card = createAdminGameCard(game);
        if (selectedGames.has(String(game.id))) card.classList.add('is-selected');
        gameGrid.appendChild(card);
      });

      renderLibraryStatusLine();
    }

    function renderLibraryStatusLine() {
      if (!allGamesData.length) return;
      const total = allGamesData.length;
      const archived = allGamesData.filter((g) => getGameState(g) === 'archived').length;
      const live = total - archived;
      const featured = allGamesData.filter((g) => isGameFeatured(g)).length;
      const selected = selectedGames.size;
      const matchingPart = searchTerm ? visibleGamesData.length + ' matching, ' : '';
      setStatus(
        libraryStatus,
        total + ' games, ' + live + ' live, ' + archived + ' archived, ' + featured + ' featured, ' + matchingPart + selected + ' selected.',
        'success'
      );
    }

    async function loadAdminLibrary() {
      setStatus(libraryStatus, 'Loading library...');
      renderLibraryEmpty('Loading games...');

      try {
        const games = await fetchGames();
        renderAdminLibrary(games);
      } catch (error) {
        console.error(error);
        renderLibraryEmpty('Could not load games.');
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    }

    function setLinkEnabled(el, href) {
      if (href) {
        el.href = href;
        el.removeAttribute('aria-disabled');
        el.removeAttribute('tabindex');
      } else {
        el.removeAttribute('href');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
      }
    }

    function setButtonLabel(labelEl, fallbackEl, value) {
      if (labelEl) labelEl.textContent = value;
      else fallbackEl.textContent = value;
    }

    function updateToolbar() {
      const count = selectedGames.size;
      const has = count > 0;
      const single = count === 1;
      const oneGame = single ? [...selectedGames.values()][0] : null;
      const allArchived = has && [...selectedGames.values()].every((g) => isFilledArchiveValue(g.archived));
      libDupBtn.disabled = !single;
      libArchBtn.disabled = !has;
      setButtonLabel(libArchBtnLabel, libArchBtn, allArchived ? 'Unarchive' : 'Archive');
      const anyFeatured = has && [...selectedGames.values()].some((g) => isGameFeatured(g));
      libFeatureBtn.disabled = !has || !GAMES_SCHEMA.featured;
      setButtonLabel(libFeatureBtnLabel, libFeatureBtn, anyFeatured ? 'Unfeature' : 'Feature');
      const visibleCount = visibleGamesData.length;
      const allVisibleSelected = visibleCount > 0 && visibleGamesData.every((g) => selectedGames.has(String(g.id)));
      libSelectAllBtn.disabled = visibleCount === 0;
      setButtonLabel(libSelectAllBtnLabel, libSelectAllBtn, allVisibleSelected ? 'Deselect All' : 'Select All');
      setLinkEnabled(libViewBtn, single ? buildRunRoute({ id: oneGame.id }) : null);
      setLinkEnabled(libEditBtn, single ? buildBuilderRoute({ id: oneGame.id }) : null);
      renderLibraryStatusLine();
    }

    libSelectAllBtn.addEventListener('click', () => {
      const cards = [...gameGrid.querySelectorAll('.admin-game-card')];
      const visibleIds = visibleGamesData.map((g) => String(g.id));
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedGames.has(id));
      if (allVisibleSelected) {
        visibleIds.forEach((id) => selectedGames.delete(id));
        lastSelectedId = null;
      } else {
        visibleGamesData.forEach((game) => selectedGames.set(String(game.id), game));
      }
      cards.forEach((c) => c.classList.toggle('is-selected', selectedGames.has(c.dataset.gameId)));
      updateToolbar();
    });

    libNewBtn.href = buildBuilderRoute({ new: '1' });

    function selectGame(game, event) {
      const id = String(game.id);
      const shift = event && event.shiftKey;
      const cards = [...gameGrid.querySelectorAll('.admin-game-card')];
      const ids = cards.map((c) => c.dataset.gameId);

      if (shift && lastSelectedId && lastSelectedId !== id && ids.includes(lastSelectedId) && ids.includes(id)) {
        const a = ids.indexOf(lastSelectedId);
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) {
          const rangeId = ids[i];
          const rangeGame = allGamesData.find((g) => String(g.id) === rangeId);
          if (rangeGame) selectedGames.set(rangeId, rangeGame);
        }
      } else {
        if (selectedGames.has(id)) selectedGames.delete(id);
        else selectedGames.set(id, game);
        lastSelectedId = id;
      }

      cards.forEach((c) => {
        c.classList.toggle('is-selected', selectedGames.has(c.dataset.gameId));
      });
      updateToolbar();

      if (shift) window.getSelection && window.getSelection().removeAllRanges();
    }

    async function patchGame(id, payload) {
      const response = await fetch(restUrl('games', { id: 'eq.' + id }), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await readError(response, 'Update failed.'));
    }

    function generateGameId() {
      return String(Math.floor(100000 + Math.random() * 900000));
    }

    async function duplicateGame(game) {
      const response = await fetch(restUrl('games', { id: 'eq.' + game.id }), {
        headers: authHeaders({ Accept: 'application/json' })
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not fetch game.'));
      const rows = await response.json();
      const source = rows[0];
      if (!source) throw new Error('Game not found.');
      const copy = Object.assign({}, source);
      copy.id = generateGameId();
      delete copy.created_at;
      delete copy.updated_at;
      copy.name = (source.name || 'Game') + ' Copy';
      copy.archived = 'YES';
      const ins = await fetch(restUrl('games'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(copy)
      });
      if (!ins.ok) throw new Error(await readError(ins, 'Duplicate failed.'));
    }

    libDupBtn.addEventListener('click', async () => {
      if (selectedGames.size !== 1) return;
      const games = [...selectedGames.values()];
      libDupBtn.disabled = true;
      setStatus(libraryStatus, 'Duplicating…');
      try {
        for (const game of games) await duplicateGame(game);
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
        libDupBtn.disabled = false;
      }
    });

    libArchBtn.addEventListener('click', async () => {
      if (!selectedGames.size) return;
      const games = [...selectedGames.values()];
      const allArchived = games.every((g) => isFilledArchiveValue(g.archived));
      libArchBtn.disabled = true;
      setStatus(libraryStatus, allArchived ? 'Unarchiving…' : 'Archiving…');
      try {
        for (const game of games) await patchGame(game.id, { archived: allArchived ? null : 'YES' });
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
        libArchBtn.disabled = false;
      }
    });

    libFeatureBtn.addEventListener('click', async () => {
      if (!selectedGames.size || !GAMES_SCHEMA.featured) return;
      const games = [...selectedGames.values()];
      const anyFeatured = games.some((g) => isGameFeatured(g));
      libFeatureBtn.disabled = true;
      setStatus(libraryStatus, anyFeatured ? 'Unfeaturing…' : 'Featuring…');
      try {
        for (const game of games) await patchGame(game.id, { featured: anyFeatured ? null : 'YES' });
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
        libFeatureBtn.disabled = false;
      }
    });

    document.querySelectorAll('[data-admin-logoff]').forEach((button) => {
      button.addEventListener('click', () => {
        adminAuth.signOut();
      });
    });

    (async function init() {
      try {
        await adminAuth.init();
      } catch (error) {
        console.error(error);
        adminAuth.showAuth(error instanceof Error ? error.message : String(error), 'error');
      }
    }());

    const libContextMenu = document.getElementById('libContextMenu');
    const ctxEditBtn = document.getElementById('ctxEditBtn');
    const ctxDupBtn = document.getElementById('ctxDupBtn');
    const ctxArchBtn = document.getElementById('ctxArchBtn');
    const ctxFeatureBtn = document.getElementById('ctxFeatureBtn');

    function openLibContextMenu(x, y) {
      const games = [...selectedGames.values()];
      const single = games.length === 1;
      const allArchived = games.every((g) => isFilledArchiveValue(g.archived));
      const anyFeatured = games.length > 0 && games.some((g) => isGameFeatured(g));
      ctxEditBtn.disabled = !single;
      ctxDupBtn.disabled = !single;
      ctxArchBtn.textContent = allArchived ? 'Unarchive' : 'Archive';
      ctxFeatureBtn.disabled = !GAMES_SCHEMA.featured;
      ctxFeatureBtn.textContent = anyFeatured ? 'Unfeature' : 'Feature';
      libContextMenu.removeAttribute('hidden');
      const menuW = libContextMenu.offsetWidth;
      const menuH = libContextMenu.offsetHeight;
      libContextMenu.style.left = Math.min(x, window.innerWidth - menuW - 8) + 'px';
      libContextMenu.style.top = Math.min(y, window.innerHeight - menuH - 8) + 'px';
    }

    function closeLibContextMenu() {
      libContextMenu.setAttribute('hidden', '');
    }

    gameGrid.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('.admin-game-card');
      if (!card) return;
      event.preventDefault();
      const game = allGamesData.find((g) => String(g.id) === card.dataset.gameId);
      if (!game) return;
      if (!selectedGames.has(game.id)) selectGame(game);
      openLibContextMenu(event.clientX, event.clientY);
    });

    ctxEditBtn.addEventListener('click', () => {
      closeLibContextMenu();
      if (selectedGames.size !== 1) return;
      const game = [...selectedGames.values()][0];
      window.location.href = buildBuilderRoute({ id: game.id });
    });

    ctxDupBtn.addEventListener('click', async () => {
      const games = [...selectedGames.values()];
      closeLibContextMenu();
      if (games.length !== 1) return;
      setStatus(libraryStatus, 'Duplicating…');
      try {
        for (const game of games) await duplicateGame(game);
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    });

    ctxArchBtn.addEventListener('click', async () => {
      const games = [...selectedGames.values()];
      closeLibContextMenu();
      if (!games.length) return;
      const allArchived = games.every((g) => isFilledArchiveValue(g.archived));
      setStatus(libraryStatus, allArchived ? 'Unarchiving…' : 'Archiving…');
      try {
        for (const game of games) await patchGame(game.id, { archived: allArchived ? null : 'YES' });
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    });

    ctxFeatureBtn.addEventListener('click', async () => {
      const games = [...selectedGames.values()];
      closeLibContextMenu();
      if (!games.length || !GAMES_SCHEMA.featured) return;
      const anyFeatured = games.some((g) => isGameFeatured(g));
      setStatus(libraryStatus, anyFeatured ? 'Unfeaturing…' : 'Featuring…');
      try {
        for (const game of games) await patchGame(game.id, { featured: anyFeatured ? null : 'YES' });
        await loadAdminLibrary();
      } catch (error) {
        setStatus(libraryStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    });

    document.addEventListener('click', (event) => {
      if (!libContextMenu.hidden && !libContextMenu.contains(event.target)) closeLibContextMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeLibContextMenu();
    });
    document.addEventListener('scroll', closeLibContextMenu, true);
  
