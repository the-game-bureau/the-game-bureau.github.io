
    const SUPABASE_CONFIG = {
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
    };

    const PHOTO_BUCKET = 'game-photo-submissions';
    const PAGE_LIMIT = 10;
    const SIGNED_URL_SECONDS = 60 * 60;

    const signOutBtn = document.getElementById('signOutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const downloadZipBtn = document.getElementById('downloadZipBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const gameFilterInput = document.getElementById('gameFilterInput');
    const reviewStatus = document.getElementById('reviewStatus');
    const darkroomStatus = document.getElementById('darkroomStatus');
    const photoGrid = document.getElementById('photoGrid');
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageIndicator = document.getElementById('pageIndicator');
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxClose = document.getElementById('lightboxClose');
    const adminAuth = window.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      signOutButton: signOutBtn,
      onAuthorized: async () => {
        await loadPhotos();
      },
      onSignedOut: () => {
        selectedPhotoIds.clear();
        currentPhotos = [];
        currentPage = 0;
        totalPhotoCount = 0;
        photoGrid.innerHTML = '';
        closeLightbox();
        renderEmpty('Sign in with an admin account.');
        setStatus(reviewStatus, '');
        setStatus(darkroomStatus, '');
        updateSelectionUi();
        updatePagination();
      }
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

    function encodeStoragePath(path) {
      return String(path || '').split('/').map(encodeURIComponent).join('/');
    }

    function storageSignUrl(bucket, path) {
      const objectPath = encodeURIComponent(bucket) + '/' + encodeStoragePath(path);
      return new URL('/storage/v1/object/sign/' + objectPath, SUPABASE_CONFIG.url + '/').toString();
    }

    function resolveSignedStorageUrl(value) {
      const signed = String(value || '').trim();
      if (!signed) return '';
      if (/^https?:\/\//i.test(signed)) return signed;

      const origin = new URL(SUPABASE_CONFIG.url).origin;
      if (signed.startsWith('/storage/v1/')) return origin + signed;
      if (signed.startsWith('/object/')) return origin + '/storage/v1' + signed;
      if (signed.startsWith('storage/v1/')) return origin + '/' + signed;
      if (signed.startsWith('object/')) return origin + '/storage/v1/' + signed;

      return new URL(signed, origin + '/storage/v1/').toString();
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

    async function fetchSubmissions(offset = 0) {
      const gameFilter = String(gameFilterInput.value || '').trim();
      const params = {
        select: 'id,created_at,game_id,player_id,storage_bucket,storage_path,file_name,mime_type,file_size,stop_id,stop_title,stop_index,flow_kind,status',
        order: 'created_at.desc',
        limit: String(PAGE_LIMIT),
        offset: String(offset)
      };
      if (gameFilter) params.game_id = 'eq.' + gameFilter;

      const response = await fetch(restUrl('photo_submissions', params), {
        headers: authHeaders({ Accept: 'application/json' }),
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not load photos.'));
      }

      return response.json();
    }

    async function fetchTotalPhotoCount() {
      const response = await fetch(restUrl('photo_submissions', { select: 'id', limit: '1' }), {
        headers: authHeaders({ Accept: 'application/json', Prefer: 'count=exact' }),
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const range = response.headers.get('Content-Range') || '';
      const match = range.match(/\/(\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    }

    async function createSignedUrl(row) {
      const bucket = row.storage_bucket || PHOTO_BUCKET;
      const response = await fetch(storageSignUrl(bucket, row.storage_path), {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }),
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS })
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not sign photo URL.'));
      }

      const payload = await response.json();
      const signed = payload.signedURL || payload.signedUrl || payload.signed_url || '';
      return resolveSignedStorageUrl(signed);
    }

    function formatDate(value) {
      if (!value) return '';
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value));
      } catch (error) {
        return String(value);
      }
    }

    function formatSize(bytes) {
      const size = Number(bytes || 0);
      if (!size) return '';
      if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
      return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function openLightbox(src, alt) {
      lightboxImage.src = src;
      lightboxImage.alt = alt || 'Submitted photo';
      lightbox.classList.add('open');
    }

    function closeLightbox() {
      lightbox.classList.remove('open');
      lightboxImage.src = '';
      lightboxImage.alt = '';
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => (
        ch === '&' ? '&amp;'
          : ch === '<' ? '&lt;'
          : ch === '>' ? '&gt;'
          : ch === '"' ? '&quot;'
          : '&#39;'
      ));
    }

    function renderEmpty(message) {
      photoGrid.innerHTML = '<div class="empty">' + escapeHtml(message) + '</div>';
    }

    let currentPhotos = [];
    let currentPage = 0;
    let totalPhotoCount = 0;
    const selectedPhotoIds = new Set();

    function updateSelectionUi() {
      const count = selectedPhotoIds.size;
      if (downloadZipBtn) {
        downloadZipBtn.disabled = count === 0;
        downloadZipBtn.textContent = count > 0 ? `Download ZIP (${count})` : 'Download ZIP';
      }
      if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = count === 0;
        deleteSelectedBtn.textContent = count > 0 ? `Delete (${count})` : 'Delete';
      }
      if (selectAllBtn) selectAllBtn.disabled = !currentPhotos.length;
      if (deselectAllBtn) deselectAllBtn.disabled = count === 0;
      renderDarkroomStatusLine();
    }

    function renderDarkroomStatusLine() {
      const total = totalPhotoCount;
      const selected = selectedPhotoIds.size;
      setStatus(darkroomStatus, total + ' photos, ' + selected + ' selected.');
    }

    function togglePhotoSelection(id, force) {
      if (!id) return;
      const shouldSelect = typeof force === 'boolean' ? force : !selectedPhotoIds.has(id);
      if (shouldSelect) selectedPhotoIds.add(id);
      else selectedPhotoIds.delete(id);
      const card = photoGrid.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
      if (card) {
        card.classList.toggle('is-selected', shouldSelect);
        const btn = card.querySelector('.photo-select');
        if (btn) btn.setAttribute('aria-pressed', shouldSelect ? 'true' : 'false');
      }
      updateSelectionUi();
    }

    function renderPhotos(items) {
      currentPhotos = Array.isArray(items) ? items : [];
      const validIds = new Set(currentPhotos.map((item) => String(item.id || '')));
      [...selectedPhotoIds].forEach((id) => { if (!validIds.has(id)) selectedPhotoIds.delete(id); });

      if (!currentPhotos.length) {
        renderEmpty('No photos found.');
        updateSelectionUi();
        return;
      }

      photoGrid.innerHTML = currentPhotos.map((item, index) => {
        const id = String(item.id || '');
        const isSelected = selectedPhotoIds.has(id);
        return `
          <article class="photo-card${isSelected ? ' is-selected' : ''}" data-card-id="${escapeAttr(id)}">
            <button class="photo-select" type="button" data-select-id="${escapeAttr(id)}" aria-pressed="${isSelected}" aria-label="Select photo">${isSelected ? '\u2713' : ''}</button>
            <button class="photo-link" type="button" data-index="${index}" aria-label="Open photo">
              <img src="${escapeHtml(item.signedUrl)}" alt="${escapeHtml(item.file_name || 'Submitted photo')}" loading="lazy">
            </button>
            <div class="meta">
              <strong>${escapeHtml(item.stop_title || item.game_id || 'Photo')}</strong>
              <span>${escapeHtml(formatDate(item.created_at))}</span>
              <span>Game: ${escapeHtml(item.game_id)}</span>
              <span>Player: ${escapeHtml(item.player_id)}</span>
              <span>${escapeHtml(item.file_name || '')}${item.file_size ? ' - ' + escapeHtml(formatSize(item.file_size)) : ''}</span>
              <span>${escapeHtml(item.status || 'submitted')}</span>
            </div>
          </article>
        `;
      }).join('');

      photoGrid.querySelectorAll('.photo-link').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index || -1);
          const item = currentPhotos[index];
          if (item && item.signedUrl) openLightbox(item.signedUrl, item.file_name);
        });
      });

      photoGrid.querySelectorAll('.photo-select').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          togglePhotoSelection(button.dataset.selectId);
        });
      });

      updateSelectionUi();
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    function buildZipFileName(item, usedNames) {
      const originalName = String(item && item.file_name || '').trim();
      const safeGame = String(item && item.game_id || 'game').replace(/[^A-Za-z0-9_-]+/g, '_');
      const safePlayer = String(item && item.player_id || 'player').replace(/[^A-Za-z0-9_-]+/g, '_');
      const ext = (originalName.match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0];
      const baseName = originalName
        ? originalName.replace(/[^A-Za-z0-9._-]+/g, '_')
        : `${safePlayer}_${String(item.id || '').slice(0, 8)}${ext}`;
      let candidate = `${safeGame}/${baseName}`;
      let counter = 2;
      while (usedNames.has(candidate)) {
        const dot = baseName.lastIndexOf('.');
        const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
        const tail = dot > 0 ? baseName.slice(dot) : '';
        candidate = `${safeGame}/${stem}_${counter}${tail}`;
        counter += 1;
      }
      usedNames.add(candidate);
      return candidate;
    }

    async function downloadSelectedAsZip() {
      if (typeof JSZip !== 'function') {
        setStatus(reviewStatus, 'ZIP library failed to load.', 'error');
        return;
      }
      const selected = currentPhotos.filter((item) => selectedPhotoIds.has(String(item.id || '')));
      if (!selected.length) return;

      downloadZipBtn.disabled = true;
      const originalLabel = downloadZipBtn.textContent;
      downloadZipBtn.textContent = `Zipping 0/${selected.length}...`;
      setStatus(reviewStatus, `Building ZIP for ${selected.length} photo${selected.length === 1 ? '' : 's'}...`);

      try {
        const zip = new JSZip();
        const usedNames = new Set();
        let done = 0;
        for (const item of selected) {
          if (!item.signedUrl) { done += 1; continue; }
          try {
            const response = await fetch(item.signedUrl);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            zip.file(buildZipFileName(item, usedNames), blob);
          } catch (err) {
            console.warn('Could not fetch for zip:', item.id, err);
          }
          done += 1;
          downloadZipBtn.textContent = `Zipping ${done}/${selected.length}...`;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
          downloadZipBtn.textContent = `Packing ${Math.round(meta.percent)}%`;
        });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `photos-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        setStatus(reviewStatus, `Downloaded ${selected.length} photo${selected.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error(err);
        setStatus(reviewStatus, 'Could not build ZIP: ' + (err instanceof Error ? err.message : String(err)), 'error');
      } finally {
        downloadZipBtn.textContent = originalLabel;
        updateSelectionUi();
      }
    }

    async function deleteSelectedPhotos() {
      const selected = currentPhotos.filter((item) => selectedPhotoIds.has(String(item.id || '')));
      if (!selected.length) return;
      const confirmed = window.confirm(
        `Permanently delete ${selected.length} photo${selected.length === 1 ? '' : 's'}?\n\n`
        + `This removes the file from storage and the submission record from the database. Cannot be undone.`
      );
      if (!confirmed) return;

      deleteSelectedBtn.disabled = true;
      const originalLabel = deleteSelectedBtn.textContent;
      deleteSelectedBtn.textContent = `Deleting 0/${selected.length}...`;
      setStatus(reviewStatus, `Deleting ${selected.length} photo${selected.length === 1 ? '' : 's'}...`);

      let deletedCount = 0;
      const failures = [];
      for (const item of selected) {
        try {
          // Remove storage object first so we don't end up with orphaned files if the row delete fails.
          if (item.storage_path) {
            const bucket = item.storage_bucket || PHOTO_BUCKET;
            const storageUrl = new URL(
              '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeStoragePath(item.storage_path),
              SUPABASE_CONFIG.url + '/'
            ).toString();
            const storageRes = await fetch(storageUrl, { method: 'DELETE', headers: authHeaders() });
            if (!storageRes.ok && storageRes.status !== 404) {
              throw new Error(await readError(storageRes, 'storage DELETE failed'));
            }
          }

          const rowUrl = restUrl('photo_submissions', { id: 'eq.' + item.id });
          const rowRes = await fetch(rowUrl, { method: 'DELETE', headers: authHeaders() });
          if (!rowRes.ok) {
            throw new Error(await readError(rowRes, 'row DELETE failed'));
          }

          selectedPhotoIds.delete(String(item.id));
          deletedCount += 1;
          deleteSelectedBtn.textContent = `Deleting ${deletedCount}/${selected.length}...`;
        } catch (err) {
          console.error('Delete failed for', item && item.id, err);
          failures.push(item && item.id);
        }
      }

      deleteSelectedBtn.textContent = originalLabel;

      if (failures.length) {
        setStatus(
          reviewStatus,
          `Deleted ${deletedCount}; ${failures.length} failed.`,
          failures.length === selected.length ? 'error' : ''
        );
      } else {
        setStatus(reviewStatus, `Deleted ${deletedCount} photo${deletedCount === 1 ? '' : 's'}.`, 'success');
      }

      await loadPhotos();
    }

    function updatePagination() {
      const totalPages = Math.ceil(totalPhotoCount / PAGE_LIMIT);
      pagination.hidden = totalPages <= 1;
      prevBtn.disabled = currentPage === 0;
      nextBtn.disabled = currentPage >= totalPages - 1;
      pageIndicator.textContent = totalPages > 0 ? (currentPage + 1) + ' / ' + totalPages : '';
    }

    async function loadPhotos() {
      refreshBtn.disabled = true;
      setStatus(reviewStatus, 'Loading...');
      renderEmpty('Loading...');

      try {
        const offset = currentPage * PAGE_LIMIT;
        const [rows, total] = await Promise.all([fetchSubmissions(offset), fetchTotalPhotoCount()]);
        const withUrls = await Promise.all(rows.map(async (row) => {
          try {
            return { ...row, signedUrl: await createSignedUrl(row) };
          } catch (error) {
            console.warn('Could not sign photo URL.', row && row.storage_path, error);
            return { ...row, signedUrl: '' };
          }
        }));
        const visibleRows = withUrls.filter((row) => row.signedUrl);
        renderPhotos(visibleRows);
        if (total !== null) {
          totalPhotoCount = total;
          renderDarkroomStatusLine();
        }
        updatePagination();
        const skipped = withUrls.length - visibleRows.length;
        setStatus(reviewStatus, skipped ? skipped + ' could not be previewed.' : '');
      } catch (error) {
        console.error(error);
        renderEmpty('Could not load photos.');
        setStatus(reviewStatus, error instanceof Error ? error.message : String(error), 'error');
      } finally {
        refreshBtn.disabled = false;
      }
    }

    document.querySelectorAll('[data-admin-logoff]').forEach((button) => {
      button.addEventListener('click', () => {
        adminAuth.signOut();
      });
    });

    refreshBtn.addEventListener('click', loadPhotos);
    clearFilterBtn.addEventListener('click', () => {
      gameFilterInput.value = '';
      currentPage = 0;
      loadPhotos();
    });
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        currentPhotos.forEach((item) => {
          const id = String(item.id || '');
          if (id) togglePhotoSelection(id, true);
        });
      });
    }
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        [...selectedPhotoIds].forEach((id) => togglePhotoSelection(id, false));
      });
    }
    if (downloadZipBtn) {
      downloadZipBtn.addEventListener('click', downloadSelectedAsZip);
    }
    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    }
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) { currentPage -= 1; loadPhotos(); }
    });
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(totalPhotoCount / PAGE_LIMIT);
      if (currentPage < totalPages - 1) { currentPage += 1; loadPhotos(); }
    });
    gameFilterInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      currentPage = 0;
      loadPhotos();
    });

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    lightboxClose.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeLightbox();
    });

    (async function init() {
      const initialParams = new URLSearchParams(window.location.search);
      gameFilterInput.value = initialParams.get('game') || initialParams.get('id') || '';

      try {
        await adminAuth.init();
      } catch (error) {
        console.error(error);
        adminAuth.showAuth(error instanceof Error ? error.message : String(error), 'error');
      }
    })();
  
