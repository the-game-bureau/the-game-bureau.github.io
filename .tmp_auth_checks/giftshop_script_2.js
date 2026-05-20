
    const SUPABASE_CONFIG = {
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
    };

    const signOutBtn   = document.getElementById('signOutBtn');
    const shopStatus   = document.getElementById('shopStatus');
    const addItemBtn   = document.getElementById('addItemBtn');
    const previewBtn   = document.getElementById('previewBtn');
    const previewShopSelect = document.getElementById('previewShopSelect');
    const itemsList    = document.getElementById('itemsList');
    const itemTemplate = document.getElementById('itemTemplate');
    const listingRowTemplate = document.getElementById('listingRowTemplate');
    const adminAuth = window.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      signOutButton: signOutBtn,
      onAuthorized: async () => {
        await showShop();
      },
      onSignedOut: () => {
        itemsList.innerHTML = '';
        gamesById = new Map();
        gameOptionsHtml = '<option value="">— Pick a game —</option>';
        previewShopSelect.innerHTML = '<option value="">All Games</option>';
        previewBtn.href = '../site/gift.html';
        addItemBtn.disabled = true;
        setStatus(shopStatus, '');
        renderEmpty();
      }
    });

    // Every game we know about (live + archived), keyed by id, so we
    // can populate per-item dropdowns AND label rows whose game has
    // been archived since the item was created.
    let gamesById = new Map();
    let gameOptionsHtml = '<option value="">— Pick a game —</option>';

    function restUrl(table, params = {}) {
      const url = new URL('/rest/v1/' + encodeURIComponent(table), SUPABASE_CONFIG.url + '/');
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      });
      return url.toString();
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
          return payload.message || payload.msg || payload.error_description || payload.error || text;
        } catch (_) { return text; }
      } catch (_) { return fallback; }
    }

    function authHeaders(extra = {}) {
      return adminAuth.authHeaders(extra);
    }

    // ── Games ────────────────────────────────────────────────────────
    async function fetchGames() {
      const response = await fetch(restUrl('games', { select: 'id,name,archived', order: 'name.asc' }), {
        headers: authHeaders({ Accept: 'application/json' }),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not load games.'));
      return response.json();
    }

    function isLive(game) {
      const dead = (v) => typeof v === 'boolean' ? v : (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'false' && v.trim() !== '0');
      return !dead(game.archived);
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function loadGames() {
      const games = await fetchGames();
      gamesById = new Map(games.map((g) => [g.id, g]));
      // Live games first, archived games grouped after.
      const live = games.filter(isLive);
      const dead = games.filter((g) => !isLive(g));
      const renderOpt = (g, suffix) =>
        '<option value="' + escapeHtml(g.id) + '">' +
        escapeHtml((g.name || g.id) + (suffix ? ' ' + suffix : '')) +
        '</option>';
      gameOptionsHtml =
        '<option value="">— Pick a game —</option>' +
        live.map((g) => renderOpt(g, '')).join('') +
        dead.map((g) => renderOpt(g, '(archived)')).join('');

      // Top-level preview picker — all shops (live first, archived after).
      previewShopSelect.innerHTML =
        '<option value="">All Games</option>' +
        live.map((g) => renderOpt(g, '')).join('') +
        dead.map((g) => renderOpt(g, '(archived)')).join('');
      updatePreviewHref();
    }

    function updatePreviewHref() {
      const id = previewShopSelect.value;
      previewBtn.href = id
        ? '../site/gift.html?game=' + encodeURIComponent(id)
        : '../site/gift.html';
    }

    function filterItemsByShop() {
      const gameId = previewShopSelect.value;
      const items = itemsList.querySelectorAll('.item');
      let visible = 0;
      items.forEach((item) => {
        if (!gameId) {
          item.classList.remove('hidden');
          visible++;
          return;
        }
        const listingSelects = item.querySelectorAll('.listing-row:not(.is-removed) [data-listing-field="game_id"]');
        const match = Array.from(listingSelects).some((sel) => sel.value === gameId);
        item.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      const total = items.length;
      const hidden = total - visible;
      setStatus(shopStatus, total + ' items, ' + visible + ' visible, ' + hidden + ' hidden.', 'success');
    }

    previewShopSelect.addEventListener('change', () => {
      updatePreviewHref();
      filterItemsByShop();
    });

    // ── Items ────────────────────────────────────────────────────────
    async function fetchAllItems() {
      // Embed each item's listings so we can render the full edit UI in
      // one round-trip. Order is title-asc; per-listing position is
      // surfaced inside each card, not at the catalog level.
      const response = await fetch(restUrl('gift_shop_items', {
        select: '*,gift_shop_listings(*)',
        order: 'title.asc.nullslast'
      }), {
        headers: authHeaders({ Accept: 'application/json' }),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not load gift shop items.'));
      return response.json();
    }

    async function insertItem(payload) {
      const response = await fetch(restUrl('gift_shop_items'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await readError(response, 'Insert failed.'));
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    async function updateItem(id, payload) {
      const response = await fetch(restUrl('gift_shop_items', { id: 'eq.' + id }), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await readError(response, 'Update failed.'));
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    async function deleteItem(id) {
      const response = await fetch(restUrl('gift_shop_items', { id: 'eq.' + id }), {
        method: 'DELETE',
        headers: authHeaders({})
      });
      if (!response.ok) throw new Error(await readError(response, 'Delete failed.'));
    }

    // ── Listings ─────────────────────────────────────────────────────
    async function insertListing(payload) {
      const response = await fetch(restUrl('gift_shop_listings'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not add listing.'));
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    async function updateListing(id, payload) {
      const response = await fetch(restUrl('gift_shop_listings', { id: 'eq.' + id }), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not update listing.'));
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    async function deleteListing(id) {
      const response = await fetch(restUrl('gift_shop_listings', { id: 'eq.' + id }), {
        method: 'DELETE',
        headers: authHeaders({})
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not remove listing.'));
    }

    function renderEmpty() {
      itemsList.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'No items yet. Click + Add item to start.';
      itemsList.appendChild(div);
    }

    function buildItemPayload(article) {
      const get = (name) => {
        const el = article.querySelector('[data-field="' + name + '"]');
        return el ? el.value : '';
      };
      const focus = String(article.dataset.imageFocus || '50% 50%');
      return {
        kind: 'amazon_link',
        title: get('title').trim() || null,
        url: get('url').trim(),
        image_url: get('image_url').trim() || null,
        image_focus: focus,
        price_display: get('price_display').trim() || null,
        description: get('description').trim() || null
      };
    }

    function readListingRow(row) {
      const game_id = String(row.querySelector('[data-listing-field="game_id"]').value || '').trim();
      const positionRaw = String(row.querySelector('[data-listing-field="position"]').value || '').trim();
      const position = positionRaw === '' ? 0 : Math.max(0, Math.floor(Number(positionRaw) || 0));
      const live = !!row.querySelector('[data-listing-field="live"]').checked;
      return { id: row.dataset.listingId || '', game_id, position, live };
    }

    function appendListingRow(listingsList, listing = {}) {
      const fragment = listingRowTemplate.content.cloneNode(true);
      const row = fragment.querySelector('.listing-row');
      const sel = row.querySelector('[data-listing-field="game_id"]');
      sel.innerHTML = gameOptionsHtml;
      const targetId = listing.game_id || '';
      if (targetId) {
        const exists = sel.querySelector('option[value="' + CSS.escape(targetId) + '"]');
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = targetId;
          opt.textContent = (gamesById.get(targetId)?.name || targetId) + ' (missing)';
          sel.appendChild(opt);
        }
        sel.value = targetId;
      }
      row.querySelector('[data-listing-field="position"]').value =
        listing.position == null ? '' : String(listing.position);
      row.querySelector('[data-listing-field="live"]').checked = !!listing.live;
      row.dataset.listingId = listing.id || '';
      row.querySelector('[data-action="remove-listing"]').addEventListener('click', () => {
        // For unsaved rows just drop them; for persisted rows mark for
        // deletion and hide so syncListings can DELETE on save.
        if (row.dataset.listingId) {
          row.classList.add('is-removed');
          row.dataset.removed = 'true';
        } else {
          row.remove();
        }
        refreshListingsEmpty(listingsList);
      });
      listingsList.appendChild(row);
      refreshListingsEmpty(listingsList);
      return row;
    }

    function refreshListingsEmpty(listingsList) {
      const live = listingsList.querySelectorAll('.listing-row:not(.is-removed)');
      let empty = listingsList.querySelector('.item-listings-empty');
      if (!live.length) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'item-listings-empty';
          empty.textContent = 'Not in any shop yet.';
          listingsList.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    }

    async function syncListings(article, itemId) {
      const rows = Array.from(article.querySelectorAll('.listing-row'));
      // 1) Removed rows that already had an id → DELETE
      const toDelete = rows.filter((r) => r.dataset.removed === 'true' && r.dataset.listingId);
      for (const row of toDelete) {
        await deleteListing(row.dataset.listingId);
        row.remove();
      }
      // 2) Live rows: insert if no id, otherwise update.
      const liveRows = rows.filter((r) => r.dataset.removed !== 'true');
      for (const row of liveRows) {
        const data = readListingRow(row);
        if (!data.game_id) continue; // skip blanks rather than erroring
        if (data.id) {
          const updated = await updateListing(data.id, {
            game_id: data.game_id,
            position: data.position,
            live: data.live
          });
          if (updated && updated.id) row.dataset.listingId = updated.id;
        } else {
          const created = await insertListing({
            item_id: itemId,
            game_id: data.game_id,
            position: data.position,
            live: data.live
          });
          if (created && created.id) row.dataset.listingId = created.id;
        }
      }
    }

    function bindItem(article, item) {
      article.dataset.id = item.id || '';
      article.classList.toggle('is-new', !item.id);

      const set = (name, value) => {
        const el = article.querySelector('[data-field="' + name + '"]');
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value == null ? '' : String(value);
      };

      set('title', item.title);
      set('url', item.url);
      set('image_url', item.image_url);
      set('price_display', item.price_display);
      set('description', item.description);

      // Render existing listings (from the embedded select) and wire
      // up the "+ Add to a shop" button. New blank items get one empty
      // row so the user has somewhere to pick a shop without an extra
      // click.
      const listingsList = article.querySelector('[data-listings-list]');
      listingsList.innerHTML = '';
      const listings = Array.isArray(item.gift_shop_listings) ? item.gift_shop_listings : [];
      const sortedListings = listings.slice().sort((a, b) => {
        const ka = (gamesById.get(a.game_id)?.name || '').toLowerCase();
        const kb = (gamesById.get(b.game_id)?.name || '').toLowerCase();
        if (ka < kb) return -1;
        if (ka > kb) return 1;
        return 0;
      });
      sortedListings.forEach((l) => appendListingRow(listingsList, l));
      if (!sortedListings.length && !item.id) {
        appendListingRow(listingsList, {});
      }
      refreshListingsEmpty(listingsList);

      article.querySelector('[data-action="add-listing"]').addEventListener('click', () => {
        const row = appendListingRow(listingsList, {});
        const sel = row.querySelector('[data-listing-field="game_id"]');
        if (sel) sel.focus();
      });

      // Focus picker: a fixed 220×220 frame matching the public site's
      // minimum card-image size. The image lives behind the frame at
      // "cover" scale (smaller dim = frame size, longer dim overflows).
      // Drag the image to slide it under the window; the resulting
      // top-left as a fraction of overflow is the object-position
      // we save back to the row.
      const FRAME_SIDE = 220;
      const focusBox = article.querySelector('.item-focus');
      const placeholder = focusBox.querySelector('[data-focus-placeholder]');

      const parseFocus = (raw) => {
        const m = String(raw || '').match(/(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%/);
        if (!m) return { x: 50, y: 50 };
        return {
          x: Math.min(100, Math.max(0, parseFloat(m[1]))),
          y: Math.min(100, Math.max(0, parseFloat(m[2])))
        };
      };

      let currentFocus = parseFocus(item.image_focus);
      let lastLayout = null;

      const writeFocus = () => {
        article.dataset.imageFocus =
          currentFocus.x.toFixed(1) + '% ' + currentFocus.y.toFixed(1) + '%';
      };
      writeFocus();

      const applyTransform = () => {
        const img = focusBox.querySelector('img');
        if (!img || !lastLayout) return;
        const tx = -(currentFocus.x / 100) * lastLayout.overflowX;
        const ty = -(currentFocus.y / 100) * lastLayout.overflowY;
        img.style.transform = 'translate3d(' + tx + 'px, ' + ty + 'px, 0)';
      };

      const sizeImage = () => {
        const img = focusBox.querySelector('img');
        if (!img || !img.naturalWidth || !img.naturalHeight) {
          lastLayout = null;
          return;
        }
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const scale = Math.max(FRAME_SIDE / W, FRAME_SIDE / H);
        const dispW = W * scale;
        const dispH = H * scale;
        lastLayout = {
          dispW, dispH,
          overflowX: Math.max(0, dispW - FRAME_SIDE),
          overflowY: Math.max(0, dispH - FRAME_SIDE)
        };
        img.style.width = dispW + 'px';
        img.style.height = dispH + 'px';
        applyTransform();
      };

      const refreshFocusImage = () => {
        const url = article.querySelector('[data-field="image_url"]').value.trim();
        const existingImg = focusBox.querySelector('img');
        if (existingImg) existingImg.remove();
        lastLayout = null;
        if (url) {
          const img = document.createElement('img');
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          img.draggable = false;
          const onLoad = () => {
            focusBox.dataset.hasImage = 'true';
            placeholder.style.display = 'none';
            sizeImage();
          };
          const onError = () => {
            img.remove();
            focusBox.dataset.hasImage = 'false';
            placeholder.style.display = '';
            lastLayout = null;
          };
          img.addEventListener('load', onLoad);
          img.addEventListener('error', onError);
          focusBox.insertBefore(img, placeholder);
          img.src = url;
          // Cached images may already be complete before our listener
          // attaches — fire onLoad synchronously in that case.
          if (img.complete && img.naturalWidth > 0) onLoad();
        } else {
          focusBox.dataset.hasImage = 'false';
          placeholder.style.display = '';
        }
      };
      refreshFocusImage();
      article.querySelector('[data-field="image_url"]').addEventListener('input', refreshFocusImage);

      // Drag the image behind the frame. Pointer delta translates 1:1
      // into transform offset (since frame and image share screen px).
      // Translate is clamped so the frame stays filled (no white edges).
      let dragging = false;
      let dragStart = null;
      focusBox.addEventListener('pointerdown', (e) => {
        if (focusBox.dataset.hasImage !== 'true' || !lastLayout) return;
        dragging = true;
        focusBox.dataset.dragging = 'true';
        try { focusBox.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        dragStart = {
          tx: -(currentFocus.x / 100) * lastLayout.overflowX,
          ty: -(currentFocus.y / 100) * lastLayout.overflowY,
          px: e.clientX,
          py: e.clientY
        };
        e.preventDefault();
      });
      focusBox.addEventListener('pointermove', (e) => {
        if (!dragging || !lastLayout || !dragStart) return;
        const dx = e.clientX - dragStart.px;
        const dy = e.clientY - dragStart.py;
        const tx = Math.max(-lastLayout.overflowX, Math.min(0, dragStart.tx + dx));
        const ty = Math.max(-lastLayout.overflowY, Math.min(0, dragStart.ty + dy));
        currentFocus.x = lastLayout.overflowX > 0 ? (-tx / lastLayout.overflowX) * 100 : 50;
        currentFocus.y = lastLayout.overflowY > 0 ? (-ty / lastLayout.overflowY) * 100 : 50;
        writeFocus();
        applyTransform();
      });
      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        dragStart = null;
        delete focusBox.dataset.dragging;
        try { focusBox.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      };
      focusBox.addEventListener('pointerup', endDrag);
      focusBox.addEventListener('pointercancel', endDrag);

      const statusEl = article.querySelector('[data-status]');
      const setItemStatus = (msg, kind = '') => setStatus(statusEl, msg, kind);

      article.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const payload = buildItemPayload(article);
        if (!payload.url) {
          setItemStatus('Amazon URL is required.', 'error');
          return;
        }
        // Validate listings before doing any writes. Collect live shop
        // ids and reject if there are duplicates or none.
        const liveRows = Array.from(
          article.querySelectorAll('.listing-row:not(.is-removed)')
        );
        const liveData = liveRows.map(readListingRow).filter((d) => d.game_id);
        if (!liveData.length) {
          setItemStatus('Add this item to at least one shop first.', 'error');
          return;
        }
        const seen = new Set();
        for (const d of liveData) {
          if (seen.has(d.game_id)) {
            setItemStatus('This item is listed in the same shop twice.', 'error');
            return;
          }
          seen.add(d.game_id);
        }
        setItemStatus('Saving…');
        try {
          let saved;
          if (article.dataset.id) {
            saved = await updateItem(article.dataset.id, payload);
          } else {
            saved = await insertItem(payload);
          }
          if (saved && saved.id) {
            article.dataset.id = saved.id;
            article.classList.remove('is-new');
          }
          await syncListings(article, article.dataset.id);
          setItemStatus('Saved.', 'success');
          setTimeout(() => setItemStatus(''), 2200);
        } catch (error) {
          console.error(error);
          setItemStatus(error instanceof Error ? error.message : String(error), 'error');
        }
      });

      article.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const id = article.dataset.id;
        if (!id) {
          // Brand-new row never saved — just remove from DOM.
          article.remove();
          if (!itemsList.children.length) renderEmpty();
          return;
        }
        if (!window.confirm('Delete this item?')) return;
        setItemStatus('Deleting…');
        try {
          await deleteItem(id);
          article.remove();
          if (!itemsList.children.length) renderEmpty();
        } catch (error) {
          console.error(error);
          setItemStatus(error instanceof Error ? error.message : String(error), 'error');
        }
      });
    }

    function appendItemRow(item = {}) {
      // Replace the empty-state placeholder if it's currently shown.
      const empty = itemsList.querySelector('.empty');
      if (empty) empty.remove();
      const fragment = itemTemplate.content.cloneNode(true);
      const article = fragment.querySelector('.item');
      itemsList.appendChild(article);
      bindItem(article, item);
      return article;
    }

    async function renderAllItems() {
      itemsList.innerHTML = '';
      setStatus(shopStatus, 'Loading items…');
      try {
        const items = await fetchAllItems();
        if (!items.length) {
          renderEmpty();
          setStatus(shopStatus, '');
          return;
        }
        items.forEach((item) => appendItemRow(item));
        filterItemsByShop();
      } catch (error) {
        console.error(error);
        renderEmpty();
        setStatus(shopStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    }

    addItemBtn.addEventListener('click', () => {
      const article = appendItemRow({});
      const titleInput = article.querySelector('[data-field="title"]');
      if (titleInput) titleInput.focus();
    });

    async function showShop() {
      addItemBtn.disabled = true;
      try {
        await loadGames();
        addItemBtn.disabled = false;
        await renderAllItems();
      } catch (error) {
        console.error(error);
        setStatus(shopStatus, error instanceof Error ? error.message : String(error), 'error');
      }
    }

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
    })();
  
