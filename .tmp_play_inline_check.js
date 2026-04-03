const TYPING_DELAY = 700;
    const BUBBLE_PAUSE = 180;

    const params  = new URLSearchParams(location.search);
    const gameId  = params.get('id') || params.get('game');
    const STORE_KEY = 'tgb_' + (gameId || 'default');
    const CHECKOUT_UNLOCKS_KEY = STORE_KEY + '_checkout_unlocks';
    const PLAYER_SESSION_KEY = STORE_KEY + '_player_id';
    const CHECKOUT_SUCCESS_COPY = 'Payment confirmed. Let\u2019s keep going.';

      const chatEl      = document.getElementById('chat');
      const inputAreaEl = document.getElementById('input-area');
      const gameInput   = document.getElementById('gameInput');
      const submitBtn   = document.getElementById('gameSubmitBtn');
      const headerTaglineEl = document.getElementById('header-tagline');

    let gameStops          = [];
    let anytimeStops       = [];
    let currentStopIndex   = 0;
    let currentBubbleIndex = 0;
    let _submitHandler     = null;
    let vars               = {};
    let checkoutUnlocksCache = null;
    let lemonScriptPromise = null;
    let lemonConfigPromise = null;
    let lemonSetupComplete = false;
    let stopCheckoutContext = null;
    let activeCheckoutContext = null;

    // ── Persistence ──────────────────────────────────────────────
    function saveStep(i) {
      try { localStorage.setItem(STORE_KEY + '_step', String(i)); } catch(e) {}
    }
    function loadStep() {
      try { return parseInt(localStorage.getItem(STORE_KEY + '_step') || '0', 10) || 0; } catch(e) { return 0; }
    }
    function saveVars() {
      try { localStorage.setItem(STORE_KEY + '_vars', JSON.stringify(vars)); } catch(e) {}
    }
    function loadVars() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY + '_vars') || '{}'); } catch(e) { return {}; }
    }
    function clearSave() {
      try {
        localStorage.removeItem(STORE_KEY + '_step');
        localStorage.removeItem(STORE_KEY + '_vars');
        vars = {};
      } catch(e) {}
    }

    // ── Helpers ───────────────────────────────────────────────────
    function loadCheckoutUnlocks() {
      if (checkoutUnlocksCache) return checkoutUnlocksCache;
      try {
        const parsed = JSON.parse(localStorage.getItem(CHECKOUT_UNLOCKS_KEY) || '{}');
        checkoutUnlocksCache = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (e) {
        checkoutUnlocksCache = {};
      }
      return checkoutUnlocksCache;
    }
    function saveCheckoutUnlocks(unlocks) {
      checkoutUnlocksCache = unlocks && typeof unlocks === 'object' ? unlocks : {};
      try { localStorage.setItem(CHECKOUT_UNLOCKS_KEY, JSON.stringify(checkoutUnlocksCache)); } catch (e) {}
    }
    function isCheckoutUnlocked(key) {
      return !!(key && loadCheckoutUnlocks()[key]);
    }
    function markCheckoutUnlocked(key, meta = {}) {
      if (!key) return;
      const unlocks = loadCheckoutUnlocks();
      unlocks[key] = {
        unlockedAt: meta.unlockedAt || new Date().toISOString(),
        sourceUrl: meta.sourceUrl || '',
        orderId: meta.orderId || ''
      };
      saveCheckoutUnlocks(unlocks);
    }
    function getPlayerSessionId() {
      try {
        let id = localStorage.getItem(PLAYER_SESSION_KEY);
        if (!id) {
          id = 'player_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
          localStorage.setItem(PLAYER_SESSION_KEY, id);
        }
        return id;
      } catch (e) {
        return 'player_' + Date.now().toString(36);
      }
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
    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, '&#96;');
    }
    function norm(s) {
      return String(s || '').toLowerCase().replace(/[$,.\s]/g, '');
    }
    function pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    function scrollBottom() {
      chatEl.scrollTop = chatEl.scrollHeight;
    }
    function normalizeVarKey(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/^\{\{\s*([A-Za-z_]\w*)\s*\}\}$/) || s.match(/^\{\s*([A-Za-z_]\w*)\s*\}$/) || s.match(/^%\s*([A-Za-z_]\w*)\s*%$/);
      return m ? m[1] : s;
    }
    function parseUrl(value) {
      try {
        return new URL(String(value || ''), window.location.href);
      } catch (e) {
        return null;
      }
    }
    function isLemonHost(hostname) {
      const host = String(hostname || '').toLowerCase();
      return host === 'lemonsqueezy.com' || host.endsWith('.lemonsqueezy.com');
    }
    function isLocalPayPageUrl(value) {
      const url = value instanceof URL ? value : parseUrl(value);
      if (!url || url.origin !== window.location.origin) return false;
      const path = String(url.pathname || '').toLowerCase();
      return path.endsWith('/game/pay.html')
        || (path.endsWith('/pay.html') && (
          url.searchParams.has('variant')
          || url.searchParams.has('game')
          || url.searchParams.has('id')
        ));
    }
    function isLemonCheckoutUrl(value) {
      const url = value instanceof URL ? value : parseUrl(value);
      return !!(url && isLemonHost(url.hostname) && /\/buy\//i.test(String(url.pathname || '')));
    }
    function isCheckoutPauseUrl(value) {
      return isLemonCheckoutUrl(value) || isLocalPayPageUrl(value);
    }
    function getCheckoutUnlockKey(value) {
      const url = value instanceof URL ? value : parseUrl(value);
      if (!url) return '';
      if (isLocalPayPageUrl(url)) {
        const variant = String(url.searchParams.get('variant') || '').trim() || 'default';
        const checkoutGameId = String(url.searchParams.get('game') || url.searchParams.get('id') || gameId || '').trim();
        return ['pay', checkoutGameId, variant].join(':');
      }
      return ['lemon', String(gameId || '').trim(), String(url.hostname || '').toLowerCase(), String(url.pathname || '').toLowerCase()].join(':');
    }
    function buildCheckoutReturnUrl(checkoutKey) {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.delete('paid');
      returnUrl.searchParams.delete('checkout_key');
      returnUrl.searchParams.set('paid', '1');
      if (checkoutKey) returnUrl.searchParams.set('checkout_key', checkoutKey);
      return returnUrl.toString();
    }
    function decorateCheckoutUrl(value, checkoutKey) {
      const checkoutUrl = value instanceof URL ? new URL(value.toString()) : parseUrl(value);
      if (!checkoutUrl) return '';
      checkoutUrl.searchParams.set('checkout[redirect_url]', buildCheckoutReturnUrl(checkoutKey));
      if (gameId && !checkoutUrl.searchParams.has('checkout[custom][game_id]')) {
        checkoutUrl.searchParams.set('checkout[custom][game_id]', gameId);
      }
      const playerId = getPlayerSessionId();
      if (playerId && !checkoutUrl.searchParams.has('checkout[custom][player_id]')) {
        checkoutUrl.searchParams.set('checkout[custom][player_id]', playerId);
      }
      if (checkoutKey && !checkoutUrl.searchParams.has('checkout[custom][checkout_key]')) {
        checkoutUrl.searchParams.set('checkout[custom][checkout_key]', checkoutKey);
      }
      return checkoutUrl.toString();
    }
    function hasUsableLemonConfig(cfg) {
      return !!(
        cfg
        && cfg.enabled
        && typeof cfg.storeSlug === 'string'
        && cfg.storeSlug.trim()
        && cfg.storeSlug !== 'your_store_slug_here'
      );
    }
    function loadLocalLemonConfig() {
      if (hasUsableLemonConfig(window.TGB_LEMON_CONFIG)) {
        return Promise.resolve(window.TGB_LEMON_CONFIG);
      }
      if (lemonConfigPromise) return lemonConfigPromise;
      lemonConfigPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = new URL('game/config/lemon-config.js', window.location.href).toString();
        script.async = true;
        script.onload = () => resolve(hasUsableLemonConfig(window.TGB_LEMON_CONFIG) ? window.TGB_LEMON_CONFIG : null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      });
      return lemonConfigPromise;
    }
    async function resolveCheckoutUrl(value) {
      const url = value instanceof URL ? value : parseUrl(value);
      if (!url) return '';
      const checkoutKey = getCheckoutUnlockKey(url);
      if (isLocalPayPageUrl(url)) {
        const cfg = await loadLocalLemonConfig();
        if (!hasUsableLemonConfig(cfg)) return '';
        const variant = String(url.searchParams.get('variant') || cfg.variantId || '').trim();
        if (!variant || variant === 'your_variant_id_here') return '';
        const checkoutUrl = new URL(`https://${cfg.storeSlug}.lemonsqueezy.com/buy/${encodeURIComponent(variant)}`);
        return decorateCheckoutUrl(checkoutUrl, checkoutKey);
      }
      if (isLemonCheckoutUrl(url)) {
        return decorateCheckoutUrl(url, checkoutKey);
      }
      return '';
    }
    function loadLemonScript() {
      if (window.LemonSqueezy) return Promise.resolve(window.LemonSqueezy);
      if (lemonScriptPromise) return lemonScriptPromise;
      lemonScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
        script.async = true;
        script.onload = () => {
          try {
            if (typeof window.createLemonSqueezy === 'function') window.createLemonSqueezy();
          } catch (e) {}
          if (window.LemonSqueezy) resolve(window.LemonSqueezy);
          else {
            lemonScriptPromise = null;
            reject(new Error('Lemon.js did not initialize.'));
          }
        };
        script.onerror = () => {
          lemonScriptPromise = null;
          reject(new Error('Could not load Lemon.js.'));
        };
        document.head.appendChild(script);
      });
      return lemonScriptPromise;
    }
    function getCheckoutOrderId(data) {
      if (!data || typeof data !== 'object') return '';
      const candidates = [
        data.order_id,
        data.orderId,
        data.order_identifier,
        data.orderIdentifier,
        data.identifier,
        data.id
      ];
      return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
    }
    function handleLemonCheckoutSuccess(data) {
      const context = activeCheckoutContext || stopCheckoutContext || null;
      completeCheckoutFlow({
        unlockKey: context && context.unlockKey,
        sourceUrl: context && context.sourceUrl,
        orderId: getCheckoutOrderId(data),
        guideText: CHECKOUT_SUCCESS_COPY
      });
    }
    function setupLemonEvents(lemon) {
      if (lemonSetupComplete || !lemon || typeof lemon.Setup !== 'function') return;
      lemon.Setup({
        eventHandler: (payload) => {
          const eventName = String(payload && (payload.event || payload.name) || '').trim();
          if (eventName === 'Checkout.Success') {
            handleLemonCheckoutSuccess(payload && payload.data ? payload.data : null);
          }
        }
      });
      lemonSetupComplete = true;
    }
    async function ensureLemonReady() {
      const lemon = await loadLemonScript();
      setupLemonEvents(lemon);
      return lemon;
    }
    function extractCheckoutTargetFromHtml(html) {
      if (!html) return null;
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      const anchors = template.content.querySelectorAll('a[href]');
      for (const anchor of anchors) {
        const href = anchor.getAttribute('href');
        if (!href || !isCheckoutPauseUrl(href)) continue;
        const resolvedUrl = parseUrl(href);
        if (!resolvedUrl) continue;
        return {
          url: resolvedUrl.toString(),
          unlockKey: getCheckoutUnlockKey(resolvedUrl),
          label: String(anchor.textContent || '').trim()
        };
      }
      return null;
    }
    function getMessageCheckoutTarget(message) {
      if (!message || typeof message !== 'object') return null;
      const buttonUrl = String(message.buttonUrl || '').trim();
      if (buttonUrl && isCheckoutPauseUrl(buttonUrl)) {
        const resolvedUrl = parseUrl(buttonUrl);
        if (resolvedUrl) {
          return {
            url: resolvedUrl.toString(),
            unlockKey: getCheckoutUnlockKey(resolvedUrl),
            label: String(message.text || '').trim()
          };
        }
      }
      return extractCheckoutTargetFromHtml(message.html || message.text || '');
    }
    function getPendingCheckoutTarget(messages, startIndex = 0) {
      const tail = Array.isArray(messages) ? messages.slice(Math.max(0, startIndex || 0)) : [];
      for (const message of tail) {
        const target = getMessageCheckoutTarget(message);
        if (target && target.unlockKey) return target;
      }
      return null;
    }
    function currentStopHasPendingCheckout(unlockKey) {
      const stop = gameStops[currentStopIndex];
      if (!stop) return false;
      const target = getPendingCheckoutTarget(getInitialStopMessages(getStopMessages(stop), currentBubbleIndex), 0);
      return !!(target && (!unlockKey || target.unlockKey === unlockKey));
    }
    function consumePaidReturnParams() {
      if (params.get('paid') !== '1') return;
      const checkoutKey = String(params.get('checkout_key') || '').trim();
      if (checkoutKey) {
        markCheckoutUnlocked(checkoutKey, { sourceUrl: window.location.href });
      }
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('paid');
        cleanUrl.searchParams.delete('checkout_key');
        window.history.replaceState(null, '', cleanUrl.toString());
      } catch (e) {}
    }
    consumePaidReturnParams();
    function interpolate(str) {
      return String(str || '').replace(/\{\{\s*([A-Za-z_]\w*)\s*\}\}|\{\s*([A-Za-z_]\w*)\s*\}|%\s*([A-Za-z_]\w*)\s*%/g, (match, k1, k2, k3) => {
        const key = k1 || k2 || k3;
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
      });
    }
    function isTriggerBubble(msg) {
      return !!(msg && (msg.fromPlayer || msg.direction === 'fromPlayer'));
    }
    function getStopMessages(stop) {
      return (Array.isArray(stop && stop.messages) ? stop.messages : [])
        .filter(m => (m.html || m.text || '').trim());
    }
    function getTriggerIndex(messages, fromIndex = 0) {
      for (let i = Math.max(0, fromIndex || 0); i < messages.length; i += 1) {
        if (isTriggerBubble(messages[i])) return i;
      }
      return -1;
    }
    function getTriggerBubble(messages, fromIndex = 0) {
      const idx = getTriggerIndex(messages, fromIndex);
      return idx >= 0 ? messages[idx] : null;
    }
    function getInitialStopMessages(messages, fromIndex = 0) {
      const start = Math.max(0, fromIndex || 0);
      const idx = getTriggerIndex(messages, start);
      return idx < 0 ? messages.slice(start) : messages.slice(start, idx);
    }
    function getPreviousGuideBubble(messages, triggerIndex) {
      for (let i = Math.max(0, triggerIndex - 1); i >= 0; i -= 1) {
        const msg = messages[i];
        if (!msg || !(msg.html || msg.text || '').trim()) continue;
        if (msg.fromPlayer || msg.direction === 'fromPlayer') continue;
        return msg;
      }
      return null;
    }

    // ── DOM builders ──────────────────────────────────────────────
    function parseVideoTimestamp(value) {
      const raw = String(value || '').trim().replace(/^#/, '').replace(/^t=/i, '');
      if (!raw) return 0;
      if (/^\d+$/.test(raw)) return Number(raw);
      let total = 0;
      const matches = raw.match(/(\d+)(h|m|s)/gi);
      if (!matches) return 0;
      matches.forEach(part => {
        const match = part.match(/(\d+)(h|m|s)/i);
        if (!match) return;
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'h') total += amount * 3600;
        else if (unit === 'm') total += amount * 60;
        else total += amount;
      });
      return total;
    }

    function getVideoLightboxConfig(rawUrl) {
      try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const parts = url.pathname.split('/').filter(Boolean);

        let youTubeId = '';
        if (host === 'youtu.be') {
          youTubeId = parts[0] || '';
        } else if (
          host === 'youtube.com'
          || host.endsWith('.youtube.com')
          || host === 'youtube-nocookie.com'
          || host.endsWith('.youtube-nocookie.com')
        ) {
          if ((parts[0] || '') === 'watch') {
            youTubeId = url.searchParams.get('v') || '';
          } else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
            youTubeId = parts[1] || '';
          }
        }

        if (youTubeId) {
          const embedUrl = new URL('https://www.youtube.com/embed/' + encodeURIComponent(youTubeId));
          const start = parseVideoTimestamp(url.searchParams.get('t') || url.searchParams.get('start') || url.hash);
          const list = url.searchParams.get('list');
          if (start > 0) embedUrl.searchParams.set('start', String(start));
          if (list) embedUrl.searchParams.set('list', list);
          embedUrl.searchParams.set('rel', '0');
          embedUrl.searchParams.set('playsinline', '1');
          return {
            src: embedUrl.toString(),
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
          };
        }

        if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
          let vimeoId = '';
          if (host === 'player.vimeo.com' && parts[0] === 'video') {
            vimeoId = parts[1] || '';
          } else {
            vimeoId = parts.find(part => /^\d+$/.test(part)) || '';
          }
          if (vimeoId) {
            return {
              src: 'https://player.vimeo.com/video/' + encodeURIComponent(vimeoId),
              allow: 'autoplay; fullscreen; picture-in-picture'
            };
          }
        }
      } catch (error) {
        return null;
      }

      return null;
    }

    function openIframeLightbox(url) {
      const videoConfig = getVideoLightboxConfig(url);
      const backdrop = document.createElement('div');
      backdrop.className = 'btn-lightbox-backdrop';
      const frame = document.createElement('div');
      frame.className = 'btn-lightbox-frame' + (videoConfig ? ' btn-lightbox-frame--video' : '');
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-lightbox-close';
      closeBtn.type = 'button';
      closeBtn.textContent = '\u00d7';
      closeBtn.setAttribute('aria-label', 'Close');
      const iframe = document.createElement('iframe');
      iframe.className = 'btn-lightbox-iframe' + (videoConfig ? ' btn-lightbox-iframe--video' : '');
      iframe.src = videoConfig ? videoConfig.src : url;
      iframe.allow = videoConfig ? videoConfig.allow : 'payment';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      if (videoConfig) iframe.allowFullscreen = true;
      frame.appendChild(closeBtn);
      frame.appendChild(iframe);
      backdrop.appendChild(frame);
      document.body.appendChild(backdrop);
      function onKey(e) {
        if (e.key === 'Escape') close();
      }
      function close() {
        backdrop.remove();
        document.removeEventListener('keydown', onKey);
      }
      closeBtn.addEventListener('click', close);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      document.addEventListener('keydown', onKey);
    }
    async function openButtonLightbox(url) {
      const parsedUrl = parseUrl(url);
      if (!parsedUrl) return;
      if (!isCheckoutPauseUrl(parsedUrl)) {
        openIframeLightbox(parsedUrl.toString());
        return;
      }

      const unlockKey = getCheckoutUnlockKey(parsedUrl);
      if (unlockKey && isCheckoutUnlocked(unlockKey) && currentStopHasPendingCheckout(unlockKey)) {
        completeCheckoutFlow({
          unlockKey,
          sourceUrl: parsedUrl.toString(),
          guideText: 'Payment already confirmed. Let\u2019s keep going.'
        });
        return;
      }

      const resolvedCheckoutUrl = await resolveCheckoutUrl(parsedUrl);
      if (!resolvedCheckoutUrl) {
        openIframeLightbox(parsedUrl.toString());
        return;
      }

      activeCheckoutContext = {
        unlockKey,
        sourceUrl: parsedUrl.toString(),
        resolvedUrl: resolvedCheckoutUrl,
        stopIndex: currentStopIndex
      };

      try {
        const lemon = await ensureLemonReady();
        if (lemon && lemon.Url && typeof lemon.Url.Open === 'function') {
          lemon.Url.Open(resolvedCheckoutUrl);
          return;
        }
      } catch (error) {
        console.warn('Could not open Lemon overlay.', error);
      }

      window.location.href = resolvedCheckoutUrl;
    }

    function addBubble(content, fromGame = true) {
      const isObj = typeof content === 'object' && content !== null;
      const html = isObj ? (content.html || content.text || '') : content;

      const wrap = document.createElement('div');

      wrap.className = 'msg ' + (fromGame ? 'from-game' : 'from-player');
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = interpolate(String(html || '')).replace(/\n/g, '<br>');
      if (bubble.querySelector('img')) wrap.classList.add('has-img');
      
      bubble.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
          const url = a.href;
          if (url && /^https?:\/\//i.test(url)) {
            e.preventDefault();
            openButtonLightbox(url);
          }
        });
      });

      wrap.appendChild(bubble);
      chatEl.appendChild(wrap);
      scrollBottom();
      return wrap;
    }
    function completeCheckoutFlow(context = {}) {
      const unlockKey = context.unlockKey
        || (activeCheckoutContext && activeCheckoutContext.unlockKey)
        || (stopCheckoutContext && stopCheckoutContext.unlockKey)
        || '';
      const sourceUrl = context.sourceUrl
        || (activeCheckoutContext && activeCheckoutContext.sourceUrl)
        || (stopCheckoutContext && stopCheckoutContext.url)
        || '';

      if (unlockKey) {
        markCheckoutUnlocked(unlockKey, {
          sourceUrl,
          orderId: context.orderId || ''
        });
      }

      const shouldResume = currentStopHasPendingCheckout(unlockKey)
        || !!(activeCheckoutContext && activeCheckoutContext.stopIndex === currentStopIndex);

      activeCheckoutContext = null;
      stopCheckoutContext = null;

      if (!shouldResume) return;

      disableInput();
      const finish = () => {
        saveStep(currentStopIndex + 1);
        advanceStop();
      };
      const guideText = String(context.guideText || CHECKOUT_SUCCESS_COPY).trim();
      if (!guideText) {
        finish();
        return;
      }
      showMessages([{ html: guideText, text: guideText }], finish);
    }

    function showTypingIndicator() {
      const el = document.createElement('div');
      el.className = 'typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      chatEl.appendChild(el);
      scrollBottom();
      return el;
    }

    // ── Message sequencing ────────────────────────────────────────
      function showMessages(messages, onDone) {
        let i = 0;
        function next() {
          if (i >= messages.length) { onDone && onDone(); return; }
          const msg = messages[i++];
          const html = msg.html || msg.text || '';
          const fromGame = !(msg && (msg.fromPlayer || msg.direction === 'fromPlayer'));
            if (!html) { next(); return; }
          const indicator = showTypingIndicator();
          setTimeout(() => {
            indicator.remove();
              addBubble(msg, fromGame);
            setTimeout(next, BUBBLE_PAUSE);
          }, TYPING_DELAY);
        }
        next();
    }

    // ── Permanent input bar ───────────────────────────────────────
    function hideInputArea() {
      if(inputAreaEl) inputAreaEl.style.display = 'none';
    }
    function showInputArea() {
      if(inputAreaEl) inputAreaEl.style.display = '';
    }
    function disableInput() {
      hideInputArea();
      gameInput.disabled = true;
      gameInput.value = '';
      gameInput.placeholder = '';
      submitBtn.disabled = true;
      _submitHandler = null;
    }

    function showTextInput(stop, startIndex = 0) {
      showInputArea();
      const allMessages = getStopMessages(stop);
      const triggerIndex = getTriggerIndex(allMessages, startIndex);
      const triggerBubble = getTriggerBubble(allMessages, startIndex);
      const reply = stop.playerReply || {};
      const triggerText = triggerBubble ? String(triggerBubble.html || triggerBubble.text || '').trim() : '';
      const placeholder = triggerBubble ? (triggerBubble.placeholder || '') : (reply.placeholder || '');
      gameInput.placeholder = placeholder || 'Type here…';
      gameInput.disabled = false;
      submitBtn.disabled = false;
      setTimeout(() => gameInput.focus(), 80);

      _submitHandler = function() {
        const val = gameInput.value.trim();
        if (!val) return;

        // Anytime stops intercept any input regardless of current stop
        const anytimeMatch = anytimeStops.find(s =>
          (s.playerReply?.answers || []).some(a => norm(a) === norm(val))
        );
        if (anytimeMatch) {
          disableInput();
          addBubble(val, false);
          const msgs = getStopMessages(anytimeMatch);
          showMessages(msgs, () => showTextInput(stop, startIndex));
          return;
        }

        let answers = [];
        let isAny = false;
        let varKey = '';
        
        if (triggerBubble) {
          answers = Array.isArray(triggerBubble.answers) && triggerBubble.answers.length > 0 
            ? triggerBubble.answers 
            : (triggerText ? triggerText.split(/\n|;|,/g).map(s=>s.trim()).filter(Boolean) : []);
          isAny = triggerBubble.replyExpected === 'any';
          varKey = normalizeVarKey(triggerBubble.storesAs || '');
        } else {
          answers = (reply.answers || []).map(a => String(a || '').trim()).filter(Boolean);
          isAny = reply.type === 'any' || answers.length === 0;
          varKey = normalizeVarKey(reply.storesAs || '');
        }

        const correct = isAny || answers.some(a => norm(a) === norm(val));

        if (varKey && correct) { vars[varKey] = val; saveVars(); }

        disableInput();
        addBubble(val, false);

        if (!correct) {
          const after = () => {
            showTextInput(stop, startIndex);
            setTimeout(() => gameInput.focus(), 80);
          };
          if (triggerBubble) {
            const previousBubble = getPreviousGuideBubble(allMessages, triggerIndex);
            if (previousBubble) showMessages([previousBubble], after);
            else after();
          } else {
            after();
            gameInput.classList.add('wrong');
            setTimeout(() => gameInput.classList.remove('wrong'), 400);
          }
          return;
        }

        const nextBubbleIndex = triggerBubble ? (getTriggerIndex(allMessages, startIndex) + 1) : allMessages.length;
        const trailingMessages = triggerBubble ? getInitialStopMessages(allMessages, nextBubbleIndex) : [];
        const trailingCheckout = getPendingCheckoutTarget(trailingMessages, 0);
        const trailingCheckoutUnlocked = !!(trailingCheckout && isCheckoutUnlocked(trailingCheckout.unlockKey));
        const advance = () => {
          currentBubbleIndex = nextBubbleIndex;
          if (trailingCheckout) {
            stopCheckoutContext = {
              ...trailingCheckout,
              stopIndex: currentStopIndex
            };
            if (trailingCheckoutUnlocked) {
              completeCheckoutFlow({
                unlockKey: trailingCheckout.unlockKey,
                sourceUrl: trailingCheckout.url,
                guideText: 'Payment already confirmed. Let\u2019s keep going.'
              });
              return;
            }
            disableInput();
            return;
          }
          if (triggerBubble && getTriggerBubble(allMessages, nextBubbleIndex)) {
            showTextInput(stop, nextBubbleIndex);
            return;
          }
          saveStep(currentStopIndex + 1);
          advanceStop();
        };
        const toShow = [];
        trailingMessages.forEach(m => toShow.push(m));
        if (toShow.length) {
          showMessages(toShow, advance);
        } else {
          advance();
        }
      };
    }

    submitBtn.addEventListener('click', () => { if (_submitHandler) _submitHandler(); });
    gameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && _submitHandler) _submitHandler(); });

    // ── Stop flow ─────────────────────────────────────────────────
    function playStop(index, startIndex = 0) {
      disableInput();
      currentStopIndex = index;
      currentBubbleIndex = Math.max(0, startIndex || 0);
      stopCheckoutContext = null;
      activeCheckoutContext = null;
      const stop    = gameStops[index];
      const reply   = stop.playerReply || {};
      const messages = getStopMessages(stop);
      const initialMessages = getInitialStopMessages(messages, currentBubbleIndex);
      const hasTrigger = !!getTriggerBubble(messages, currentBubbleIndex);
      const allowLegacyReply = currentBubbleIndex === 0;
      const pendingCheckout = getPendingCheckoutTarget(initialMessages, 0);
      const checkoutUnlocked = !!(pendingCheckout && isCheckoutUnlocked(pendingCheckout.unlockKey));

      const hasCallToAction = messages.slice(currentBubbleIndex).some(m => m.callToAction);
      const needsInput = hasTrigger
        || (allowLegacyReply && reply.type === 'any')
        || (allowLegacyReply && Array.isArray(reply.answers) && reply.answers.length > 0)
        || (allowLegacyReply && !!(reply.placeholder && reply.placeholder.trim()))
        || hasCallToAction;

      showMessages(initialMessages, () => {
        if (pendingCheckout) {
          stopCheckoutContext = {
            ...pendingCheckout,
            stopIndex: index
          };
          if (checkoutUnlocked) {
            completeCheckoutFlow({
              unlockKey: pendingCheckout.unlockKey,
              sourceUrl: pendingCheckout.url,
              guideText: 'Payment already confirmed. Let\u2019s keep going.'
            });
            return;
          }
          disableInput();
          return;
        }
        if (needsInput) {
          showTextInput(stop, currentBubbleIndex);
        } else {
          setTimeout(() => { saveStep(index + 1); advanceStop(); }, 400);
        }
      });
    }

    function advanceStop() {
      const next = currentStopIndex + 1;
      if (next >= gameStops.length) { disableInput(); return; }
      playStop(next);
    }

    // ── Restart ───────────────────────────────────────────────────
    document.getElementById('restartBtn').addEventListener('click', () => {
      clearSave();
      chatEl.innerHTML = '';
      disableInput();
      playStop(0);
    });

    // ── Boot ──────────────────────────────────────────────────────
    disableInput();

    const SB_CONFIG = {
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3',
      table: 'games'
    };

    async function fetchGameFromSupabase(id) {
      const requestUrl = new URL(`rest/v1/${SB_CONFIG.table}`, `${SB_CONFIG.url.replace(/\/+$/, '')}/`);
      requestUrl.searchParams.set('select', '*');
      requestUrl.searchParams.set('id', `eq.${id}`);
      requestUrl.searchParams.set('limit', '1');

      const response = await fetch(requestUrl.toString(), {
        headers: {
          apikey: SB_CONFIG.key,
          Authorization: `Bearer ${SB_CONFIG.key}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) throw new Error('Network error');
      const rows = await response.json();
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    function resolveAssetUrl(value) {
      if (typeof value !== 'string' || !value.trim()) return '';
      const raw = value.trim();
      if (/^(data:|blob:)/i.test(raw)) return raw;
      try {
        const resolvedUrl = new URL(raw, window.location.href);
        const protocol = String(resolvedUrl.protocol || '').toLowerCase();
        return protocol === 'http:' || protocol === 'https:' || protocol === 'file:' ? resolvedUrl.toString() : '';
      } catch (error) {
        return '';
      }
    }

    function applyHeaderImages(gameNode) {
      const thumbnailEl = document.getElementById('gameThumbnail');
      const headerLogoEl = document.getElementById('header-logo');
      const avatarWrap = headerLogoEl && headerLogoEl.closest('.avatar');
      if (!thumbnailEl || !headerLogoEl || !avatarWrap) return;

      const guideImageUrl = resolveAssetUrl((gameNode && (gameNode.guideImage || gameNode.guideImageUrl)) || '');
      const logoUrl = resolveAssetUrl((gameNode && (gameNode.logo || gameNode.logoUrl)) || '');
      const fallbackLogoUrl = logoUrl || resolveAssetUrl('assets/logo.png') || 'assets/logo.png';

      headerLogoEl.onerror = () => {
        headerLogoEl.onerror = null;
        headerLogoEl.src = resolveAssetUrl('assets/logo.png') || 'assets/logo.png';
      };
      headerLogoEl.src = fallbackLogoUrl;
      headerLogoEl.alt = (gameNode && (gameNode.title || gameNode.guideName)) || 'Game Logo';

      avatarWrap.style.display = '';
      thumbnailEl.classList.remove('show');
      thumbnailEl.removeAttribute('src');
      thumbnailEl.onerror = null;
      thumbnailEl.alt = (gameNode && (gameNode.guideName || gameNode.title)) || 'Guide image';

      if (!guideImageUrl) return;

      thumbnailEl.onerror = () => {
        thumbnailEl.onerror = null;
        thumbnailEl.classList.remove('show');
        thumbnailEl.removeAttribute('src');
        avatarWrap.style.display = '';
      };
      thumbnailEl.src = guideImageUrl;
      thumbnailEl.classList.add('show');
      avatarWrap.style.display = 'none';
    }

    function buildLegacyPayload(gameData) {
      const nodes = Array.isArray(gameData.nodes) ? gameData.nodes : [];
      const sortedNodes = [...nodes].sort((a, b) => {
        const rankA = a.type === 'game' ? 0 : (a.anytime ? 2 : 1);
        const rankB = b.type === 'game' ? 0 : (b.anytime ? 2 : 1);
        if (rankA !== rankB) return rankA - rankB;
        return (a.orderIndex || 0) - (b.orderIndex || 0);
      });

      const stops = [];
      let currentStop = null;

      sortedNodes.forEach(node => {
        if (node.type === 'game') return;

        if (node.anytime) {
          if (node.type === 'reply') {
            stops.push({
              id: node.id,
              playerReply: {
                anytime: true,
                anytimePairId: node.anytimePairId,
                answers: node.body ? node.body.split(/\n|;|,/g).map(s=>s.trim()).filter(Boolean) : [],
                storesAs: node.varName,
                type: node.acceptAny ? 'any' : 'text'
              },
              messages: []
            });
          } else if (node.type === 'bubble') {
            const target = stops.find(s => s.playerReply?.anytimePairId === node.anytimePairId);
            if (target) {
              target.messages.push({
                bubbleId: node.id,
                text: node.body,
                html: node.body
              });
            }
          }
          return;
        }

        if (node.type === 'stop') {
          currentStop = {
            id: node.id,
            title: node.title,
            messages: [],
            playerReply: null
          };
          stops.push(currentStop);
        } else if (node.type === 'bubble') {
          if (!currentStop) {
            currentStop = { id: 'virtual-stop', messages: [], playerReply: null };
            stops.push(currentStop);
          }
          currentStop.messages.push({
            bubbleId: node.id,
            text: node.body,
            html: node.body,
            callToAction: false
          });
        } else if (node.type === 'button') {
          if (!currentStop) {
            currentStop = { id: 'virtual-stop', messages: [], playerReply: null };
            stops.push(currentStop);
          }
          const buttonLabel = String(node.title || node.body || 'Continue').trim() || 'Continue';
          const buttonUrl = String(node.buttonUrl || '').trim();
          currentStop.messages.push({
            bubbleId: node.id,
            text: buttonLabel,
            html: buttonUrl
              ? `<a class="action-btn" href="${escapeAttr(buttonUrl)}">${escapeHtml(buttonLabel)}</a>`
              : escapeHtml(buttonLabel),
            buttonUrl: buttonUrl,
          });
        } else if (node.type === 'reply') {
          if (!currentStop) {
            currentStop = { id: 'virtual-stop', messages: [], playerReply: null };
            stops.push(currentStop);
          }
          if (currentStop.messages.length > 0) {
            currentStop.messages[currentStop.messages.length - 1].callToAction = true;
          }
          const answers = node.body ? node.body.split(/\n|;|,/g).map(s=>s.trim()).filter(Boolean) : [];
          currentStop.messages.push({
            bubbleId: node.id,
            fromPlayer: true,
            text: answers[0] || node.varName || '[Answered]',
            html: answers[0] || node.varName || '[Answered]',
            replyExpected: node.acceptAny ? 'any' : 'word',
            answers: answers,
            storesAs: node.varName,
            placeholder: 'Type here...'
          });
        }
      });

      return { stops };
    }

    if (!gameId) {
      chatEl.textContent = 'Game not found. Check the ?id= parameter.';
    } else {
      fetchGameFromSupabase(gameId).then(gameData => {
        if (!gameData) {
          chatEl.textContent = 'Game not found in database.';
          return;
        }

        const gameNode = (gameData.nodes || []).find(n => n.type === 'game') || {};

        document.title = gameNode.title || gameData.name || gameId;
        document.getElementById('header-title').textContent = gameNode.title || gameData.name || gameId;
        headerTaglineEl.textContent = gameNode.tagline || '';
        headerTaglineEl.hidden = !String(gameNode.tagline || '').trim();
        document.getElementById('header-subtitle').textContent = gameNode.guideName || '';

        applyHeaderImages(gameNode);

        if (gameNode.primaryColor) {
          document.documentElement.style.setProperty('--game-primary', gameNode.primaryColor);
        }
        if (gameNode.tertiaryColor) {
          document.documentElement.style.setProperty('--game-tertiary', gameNode.tertiaryColor);
        }

        const payload = buildLegacyPayload(gameData);
        const allStops = payload.stops || [];
        
        anytimeStops = allStops.filter(s => s.playerReply?.anytime);
        gameStops = allStops.filter(s => !s.playerReply?.anytime);

        if (!gameStops.length) { chatEl.textContent = 'No stops configured for this game.'; return; }

        vars = loadVars();
        const savedStep = Math.min(loadStep(), gameStops.length - 1);
        if (savedStep > 0) {
          for (let i = 0; i < savedStep; i++) {
            const stop = gameStops[i];
            let hasTriggerBubble = false;
            (stop.messages || []).filter(m => (m.html || m.text || '').trim()).forEach(m => {
              if (m.fromPlayer || m.direction === 'fromPlayer') {
                hasTriggerBubble = true;
                let replyText = m.text || m.html;
                const varKey = m.storesAs ? normalizeVarKey(m.storesAs) : '';
                if (varKey && vars[varKey]) {
                  replyText = vars[varKey];
                }
                addBubble(replyText, false);
              } else {
                addBubble(m, true);
              }
            });
            
            if (!hasTriggerBubble && stop.playerReply) {
              const pr = stop.playerReply;
              let replyText = '';
              const varKey = pr.storesAs ? normalizeVarKey(pr.storesAs) : '';
              if (varKey && vars[varKey]) {
                replyText = vars[varKey];
              } else if (pr.answers && pr.answers.length > 0) {
                replyText = pr.answers[0];
              } else {
                replyText = '[Answered]';
              }
              if (replyText) {
                addBubble(replyText, false);
              }
            }
          }
        }
        playStop(savedStep);

      }).catch(err => {
        console.error(err);
        chatEl.textContent = 'Could not load game data.';
      });
    }
