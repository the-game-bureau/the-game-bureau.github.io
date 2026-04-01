window.TGB_SUPABASE_CONFIG = {
      enabled: true,
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3',
      gamesTable: 'games'
    };

    async function fetchGames(config) {
      const baseUrl = `${config.url.replace(/\/+$/, '')}/`;
      const requestUrl = new URL(`rest/v1/${config.gamesTable}`, baseUrl);
      requestUrl.searchParams.set('select', 'id,name');
      requestUrl.searchParams.set('order', 'name.asc');

      const response = await fetch(requestUrl.toString(), {
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;

        try {
          const errorPayload = await response.json();
          message =
            errorPayload.message ||
            errorPayload.error_description ||
            errorPayload.error ||
            message;
        } catch (parseError) {
          // Fall back to the status-based message when no JSON body is available.
        }

        throw new Error(message);
      }

      return response.json();
    }

    function renderEmptyState(listContainer, message, className = 'empty-state') {
      listContainer.innerHTML = '';

      const item = document.createElement('li');
      item.className = className;
      item.textContent = message;
      listContainer.appendChild(item);
    }

    function renderList(listContainer, games, filter = '') {
      listContainer.innerHTML = '';

      const filteredGames = games.filter((game) =>
        (game.name || '').toLowerCase().includes(filter.toLowerCase())
      );

      if (filteredGames.length === 0) {
        renderEmptyState(listContainer, 'No games match your search.');
        return;
      }

      filteredGames.forEach((game, index) => {
        const li = document.createElement('li');
        li.className = 'game-card';
        li.style.animationDelay = `${(index % 10) * 0.1}s`;

        const titleWrap = document.createElement('div');
        const title = document.createElement('h2');
        title.className = 'game-title';
        title.textContent = game.name || 'Untitled Game';
        titleWrap.appendChild(title);

        const playAction = document.createElement('div');
        playAction.className = 'play-action';

        const playLink = document.createElement('a');
        playLink.className = 'play-btn';
        playLink.href = `game.html?id=${encodeURIComponent(game.id ?? '')}`;
        playLink.textContent = 'Play Game';
        playAction.appendChild(playLink);

        li.append(titleWrap, playAction);
        listContainer.appendChild(li);
      });
    }

    async function loadGames() {
      const listContainer = document.getElementById('gamesListContainer');
      const searchInput = document.getElementById('gameSearch');

      if (!window.TGB_SUPABASE_CONFIG) {
        renderEmptyState(listContainer, 'Error: Could not load database configuration.', 'error-state');
        return;
      }

      try {
        const games = await fetchGames(window.TGB_SUPABASE_CONFIG);

        if (!games || games.length === 0) {
          renderEmptyState(listContainer, 'No games available right now.');
          return;
        }

        renderList(listContainer, games);

        searchInput.addEventListener('input', (e) => {
          renderList(listContainer, games, e.target.value);
        });
      } catch (err) {
        console.error('Database fetch error:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        renderEmptyState(listContainer, `System Error: ${errorMessage}`, 'error-state');
      }
    }

    document.addEventListener('DOMContentLoaded', loadGames);
