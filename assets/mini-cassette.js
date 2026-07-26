/* ===========================================================================
   mini-cassette.js — the floating cassette case that follows a listener
   around the site.

   WHAT THIS IS
   The /sound/ page plays city soundtracks through a Spotify iframe embed
   inside its cassette modal. Minimizing that modal pins it to the lower-right
   as a small cassette case (centered on mobile). This script carries that case
   onto the other pages the case is allowed on — games, shop, highlights — and
   picks the track back up where it stopped.

   THE ONE THING IT CANNOT DO
   Keep audio running THROUGH a navigation. The audio lives in a cross-origin
   Spotify iframe; a full page load destroys it, and no amount of scripting
   survives that on a multi-page static site. So this is a RESUME, not a
   continuation: each new page rebuilds the embed at the saved track+position.
   Expect a beat of silence while the new page loads, and expect browsers to
   refuse to make sound without a gesture on the new page — hence the
   TAP TO PLAY state (see resumePlayback below). This is the honest ceiling of
   the design, not a bug to be fixed later.

   OWNERSHIP
   - /sound/ sets window.TGB_CASSETTE_HOME = true. There, this file is only the
     session store + the CSS for the case; the page drives its own player, so
     that minimizing never interrupts audio (the iframe is restyled in place,
     never re-parented — moving an iframe in the DOM reloads it).
   - Everywhere else this file owns a case AND its own Spotify controller.

   SESSION SHAPE (sessionStorage, so it dies with the tab)
     { songs: [{href,title,artist}], index, position, playing, city,
       accent, artUrl, updatedAt }
   Cleared only when the listener closes the case. That is what "plays across
   the site until closed" means here.
   =========================================================================== */
(function () {
  'use strict';

  var KEY = 'tgb_cassette_session_v1';
  var API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
  var SOUND_URL = '/sound/';

  // ── Session store ─────────────────────────────────────────────────────────
  function read() {
    try {
      var raw = window.sessionStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.songs) || !data.songs.length) return null;
      data.index = Math.max(0, Math.min(data.songs.length - 1, Number(data.index) || 0));
      data.position = Math.max(0, Number(data.position) || 0);
      return data;
    } catch (e) { return null; }
  }

  function write(patch) {
    var next = patch || null;
    if (!next || !Array.isArray(next.songs) || !next.songs.length) return null;
    next.updatedAt = nowMs();
    try { window.sessionStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  function clear() {
    try { window.sessionStorage.removeItem(KEY); } catch (e) {}
  }

  // Date.now() via a wrapper so there is a single place to reason about time.
  function nowMs() { return new Date().getTime(); }

  function trackId(href) {
    var m = String(href || '').match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return m ? m[1] : '';
  }

  function spotifyUri(href) {
    var id = trackId(href);
    return id ? 'spotify:track:' + id : '';
  }

  // The Spotify API injects its own iframe; keep allow="autoplay" stamped on it.
  function stampAutoplayPermission(host) {
    if (!host || typeof MutationObserver !== 'function') return;
    var ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write';
    var stamp = function () {
      var ifr = host.querySelector('iframe');
      if (!ifr || ifr.getAttribute('allow') === ALLOW) return;
      try { ifr.setAttribute('allow', ALLOW); } catch (e) {}
    };
    stamp();
    var obs = new MutationObserver(stamp);
    obs.observe(host, { childList: true, subtree: true });
    window.setTimeout(function () { obs.disconnect(); }, 10000);
  }

  // ── Spotify IFrame API ────────────────────────────────────────────────────
  // The API announces itself through a single global callback. Chain rather
  // than overwrite, so this never stomps a page that also uses the embed API.
  var api = null;
  var apiWaiters = [];
  var apiRequested = false;

  function withApi(fn) {
    if (api) { fn(api); return; }
    // The API announces itself exactly once per page. If something else already
    // loaded it (on /sound/ the full player does), a fresh
    // onSpotifyIframeApiReady would never be called and this case would sit
    // there with no embed — so pick the object up from the shared handle.
    if (window.__tgbSpotifyIframeApi) { api = window.__tgbSpotifyIframeApi; fn(api); return; }
    apiWaiters.push(fn);
    if (apiRequested) return;
    apiRequested = true;
    var prior = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = function (IFrameAPI) {
      api = IFrameAPI;
      window.__tgbSpotifyIframeApi = IFrameAPI;
      if (typeof prior === 'function') { try { prior(IFrameAPI); } catch (e) {} }
      apiWaiters.splice(0).forEach(function (waiter) {
        try { waiter(IFrameAPI); } catch (e) {}
      });
    };
    var script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    document.head.appendChild(script);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  // Injected rather than added to a stylesheet so a page only needs the one
  // <script> tag to opt in. Kept in this file so the case looks identical
  // everywhere it appears.
  // Expressed in the page's own palette vars (--paper-strong / --ink / --line /
  // --accent), never in literal colors. The site skin is a swappable layer —
  // civic-modernist-pages.css currently remaps those vars to a white/navy
  // scheme, and the cassette panel on /sound/ follows it. The case has to land
  // on whatever the skin says, or minimizing on /sound/ and then navigating
  // would hand the listener two different-looking objects. Fallbacks are the
  // dark cassette palette for any page without the skin.
  var CSS = [
    '.tgb-mini{position:fixed;right:18px;bottom:18px;z-index:2147482000;',
    'width:288px;font-family:inherit;color:var(--ink,#f7f0dc);}',
    '.tgb-mini[hidden]{display:none;}',
    /* The case: a slab with the tape's accent down the spine. */
    '.tgb-mini-shell{position:relative;display:grid;grid-template-columns:52px minmax(0,1fr);',
    'gap:10px;padding:10px 10px 12px 14px;border:1px solid var(--line-strong,#28344a);',
    'background:var(--paper-strong,#131822);',
    'box-shadow:var(--shadow-panel,0 18px 44px rgba(0,0,0,.55));}',
    '.tgb-mini-shell::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;',
    'background:var(--tgb-mini-accent,#2a5a66);}',
    /* Art well doubles as the "go back to /sound/" affordance. */
    '.tgb-mini-art{position:relative;display:grid;place-items:center;width:52px;height:52px;',
    'overflow:hidden;border:1px solid var(--line,#344154);background:var(--surface,#05070d);',
    'text-decoration:none;color:inherit;}',
    '.tgb-mini-art img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.tgb-mini-art svg{width:34px;height:22px;}',
    '.tgb-mini-meta{min-width:0;display:grid;align-content:center;gap:2px;padding-right:50px;}',
    '.tgb-mini-title{margin:0;font-size:.78rem;font-weight:700;line-height:1.2;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.tgb-mini-artist{margin:0;font-size:.66rem;line-height:1.25;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted,rgba(247,240,220,.62));}',
    /* The blurb is the one line allowed to wrap — it is a sentence, not a label. */
    '.tgb-mini-blurb{margin:2px 0 0;font-size:.62rem;line-height:1.3;',
    'color:var(--muted,rgba(247,240,220,.62));display:-webkit-box;-webkit-line-clamp:2;',
    '-webkit-box-orient:vertical;overflow:hidden;}',
    '.tgb-mini-blurb[hidden]{display:none;}',
    /* City sits at the far end of the transport row, opposite the buttons. */
    '.tgb-mini-city{margin:0 0 0 auto;min-width:0;text-align:right;font-size:.62rem;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    'color:var(--tgb-mini-accent,#8fd0dd);text-transform:uppercase;font-weight:700;}',
    '.tgb-mini-controls{grid-column:1/-1;display:flex;align-items:center;gap:6px;}',
    '.tgb-mini-btn{display:grid;place-items:center;min-width:34px;height:28px;padding:0 6px;',
    'border:1px solid var(--line-strong,#344154);background:var(--surface,#101725);',
    'color:var(--ink,#f7f0dc);font-family:inherit;font-size:.66rem;line-height:1;cursor:pointer;}',
    '.tgb-mini-btn:hover,.tgb-mini-btn:focus-visible{border-color:var(--accent,#f5b461);',
    'color:var(--accent,#f5b461);outline:none;}',
    '.tgb-mini-btn--play{min-width:44px;}',
    /* Progress: a hairline tape counter across the bottom of the case. */
    '.tgb-mini-bar{grid-column:1/-1;height:3px;background:var(--line,rgba(255,255,255,.08));overflow:hidden;}',
    '.tgb-mini-bar span{display:block;height:100%;width:0;background:var(--tgb-mini-accent,#2a5a66);}',
    '.tgb-mini-close,.tgb-mini-max{position:absolute;top:6px;display:grid;place-items:center;',
    'width:22px;height:22px;border:1px solid var(--line-strong,#344154);',
    'background:var(--surface,#101725);color:var(--ink,#f7f0dc);',
    'font-family:inherit;font-size:.56rem;line-height:1;cursor:pointer;}',
    '.tgb-mini-close{right:6px;}',
    '.tgb-mini-max{right:32px;}',   /* one key width + gap to the left of close */
    '.tgb-mini-close:hover,.tgb-mini-close:focus-visible{border-color:var(--signal,#ff6f5a);',
    'color:var(--signal,#ff6f5a);outline:none;}',
    '.tgb-mini-max:hover,.tgb-mini-max:focus-visible{border-color:var(--accent,#f5b461);',
    'color:var(--accent,#f5b461);outline:none;}',
    /* The embed itself: present and near-invisible rather than display:none,
       because a hidden iframe gets its audio throttled by the browser. */
    '.tgb-mini-host{position:absolute;left:0;bottom:0;width:200px;height:80px;',
    'opacity:.001;pointer-events:none;overflow:hidden;z-index:0;}',
    '.tgb-mini-host iframe{width:100%;height:80px;border:0;display:block;}',
    /* Autoplay was refused — the case says so instead of looking stuck. */
    '.tgb-mini.is-blocked .tgb-mini-btn--play{border-color:var(--accent,#f5b461);color:var(--accent,#f5b461);}',
    '.tgb-mini.is-blocked .tgb-mini-city{color:var(--accent,#f5b461);}',
    '@media (max-width:640px){',
    '.tgb-mini{right:auto;left:50%;transform:translateX(-50%);bottom:12px;width:min(320px,calc(100vw - 24px));}',
    '}',
    '@media (prefers-reduced-motion:no-preference){',
    '.tgb-mini{animation:tgbMiniIn 220ms ease-out both;}',
    '@keyframes tgbMiniIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}',
    '}',
    /* The mobile rule already owns transform, so the entrance animation would
       fight it and yank the case off-center. Opacity only down there. */
    '@media (prefers-reduced-motion:no-preference) and (max-width:640px){',
    '@keyframes tgbMiniIn{from{opacity:0;}to{opacity:1;}}',
    '}'
  ].join('');

  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.dataset.tgbMiniCassette = 'true';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // A cassette glyph for the art well before (or instead of) album art.
  function cassetteGlyph() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 34 22');
    svg.setAttribute('aria-hidden', 'true');
    var body = document.createElementNS(NS, 'rect');
    body.setAttribute('x', '1'); body.setAttribute('y', '1');
    body.setAttribute('width', '32'); body.setAttribute('height', '20');
    body.setAttribute('rx', '2');
    body.setAttribute('fill', 'var(--tgb-mini-accent,#2a5a66)');
    svg.appendChild(body);
    [12, 22].forEach(function (cx) {
      var hub = document.createElementNS(NS, 'circle');
      hub.setAttribute('cx', String(cx)); hub.setAttribute('cy', '11');
      hub.setAttribute('r', '4');
      hub.setAttribute('fill', '#05070d');
      svg.appendChild(hub);
    });
    return svg;
  }

  // ── The floating case ─────────────────────────────────────────────────────
  function MiniCase(session, opts) {
    this.session = session;
    // On /sound/ the case is the minimized state of the full player, so the art
    // expands back into it instead of navigating to the page we're already on.
    this.onExpand = (opts && opts.onExpand) || null;
    this.controller = null;
    this.entity = '';
    this.blocked = false;
    this.saveAt = 0;
    this.build();
    this.render();
    this.resumePlayback();
  }

  MiniCase.prototype.build = function () {
    injectStyles();
    var self = this;
    var root = document.createElement('div');
    root.className = 'tgb-mini';
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Cassette player');
    root.innerHTML = '' +
      '<div class="tgb-mini-shell">' +
        '<a class="tgb-mini-art" href="' + SOUND_URL + '" aria-label="Open the soundtracks page"></a>' +
        '<div class="tgb-mini-meta">' +
          '<p class="tgb-mini-title"></p>' +
          '<p class="tgb-mini-artist"></p>' +
          '<p class="tgb-mini-blurb"></p>' +
        '</div>' +
        '<div class="tgb-mini-controls">' +
          '<button class="tgb-mini-btn tgb-mini-prev" type="button" aria-label="Previous track">&#9664;&#9664;</button>' +
          '<button class="tgb-mini-btn tgb-mini-btn--play tgb-mini-play" type="button" aria-label="Play">&#9654;</button>' +
          '<button class="tgb-mini-btn tgb-mini-next" type="button" aria-label="Next track">&#9654;&#9654;</button>' +
          '<p class="tgb-mini-city"></p>' +
        '</div>' +
        '<div class="tgb-mini-bar"><span></span></div>' +
        '<button class="tgb-mini-max" type="button" aria-label="Open the full cassette">&#10530;</button>' +
        '<button class="tgb-mini-close" type="button" aria-label="Close cassette">X</button>' +
        '<div class="tgb-mini-host" aria-hidden="true"></div>' +
      '</div>';
    document.body.appendChild(root);

    this.root = root;
    this.els = {
      art: root.querySelector('.tgb-mini-art'),
      title: root.querySelector('.tgb-mini-title'),
      blurb: root.querySelector('.tgb-mini-blurb'),
      artist: root.querySelector('.tgb-mini-artist'),
      city: root.querySelector('.tgb-mini-city'),
      play: root.querySelector('.tgb-mini-play'),
      bar: root.querySelector('.tgb-mini-bar span'),
      host: root.querySelector('.tgb-mini-host')
    };

    if (this.onExpand) {
      this.els.art.setAttribute('aria-label', 'Expand the cassette');
      this.els.art.addEventListener('click', function (e) {
        e.preventDefault();
        self.onExpand();
      });
    }

    // Maximize: on /sound/ the host page swaps the case back for the full
    // cassette; anywhere else there is no cassette to open, so send the
    // listener to /sound/ with a flag that opens it on arrival.
    root.querySelector('.tgb-mini-max').addEventListener('click', function () {
      if (self.onExpand) { self.onExpand(); return; }
      self.persist(true);
      window.location.href = SOUND_URL + '?expand=1';
    });

    root.querySelector('.tgb-mini-prev').addEventListener('click', function () { self.step(-1); });
    root.querySelector('.tgb-mini-next').addEventListener('click', function () { self.step(1); });
    this.els.play.addEventListener('click', function () { self.toggle(); });
    root.querySelector('.tgb-mini-close').addEventListener('click', function () { self.close(); });

    // Save the last known position on the way out so the next page resumes
    // where the ear left off rather than at the top of the track. Kept as a
    // named reference: destroy() must remove it, or a closed case would rewrite
    // the session it just cleared and come back on the next page load.
    this.onPageHide = function () { self.persist(true); };
    window.addEventListener('pagehide', this.onPageHide);
  };

  MiniCase.prototype.song = function () {
    return this.session.songs[this.session.index] || null;
  };

  MiniCase.prototype.render = function () {
    var song = this.song();
    if (!song) return;
    var accent = /^#[0-9a-fA-F]{3,6}$/.test(this.session.accent || '') ? this.session.accent : '#2a5a66';
    this.root.style.setProperty('--tgb-mini-accent', accent);
    this.els.title.textContent = song.title || 'Track';
    this.els.artist.textContent = song.artist || '';
    // The track explanation, same line the cassette label carries.
    this.els.blurb.textContent = song.blurb || '';
    this.els.blurb.hidden = !song.blurb;
    this.els.city.textContent = this.blocked
      ? 'Tap play'
      : (this.session.city || '').split(',')[0];
    this.els.art.href = SOUND_URL;
    this.els.art.textContent = '';
    if (this.session.artUrl) {
      var img = document.createElement('img');
      img.src = this.session.artUrl;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      var art = this.els.art;
      img.addEventListener('error', function () {
        art.textContent = '';
        art.appendChild(cassetteGlyph());
      });
      this.els.art.appendChild(img);
    } else {
      this.els.art.appendChild(cassetteGlyph());
    }
    this.renderPlayState();
  };

  MiniCase.prototype.renderPlayState = function () {
    var playing = !!this.session.playing;
    this.els.play.innerHTML = playing ? '&#10073;&#10073;' : '&#9654;';
    this.els.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.root.classList.toggle('is-blocked', this.blocked && !playing);
  };

  MiniCase.prototype.renderProgress = function () {
    var d = Number(this.session.duration) || 0;
    var p = Number(this.session.position) || 0;
    this.els.bar.style.width = d > 0 ? (Math.max(0, Math.min(1, p / d)) * 100) + '%' : '0';
  };

  // Build the controller for the current track and try to pick up mid-song.
  MiniCase.prototype.resumePlayback = function () {
    var self = this;
    var song = this.song();
    if (!song || !trackId(song.href)) return;
    var mount = document.createElement('div');
    this.els.host.textContent = '';
    this.els.host.appendChild(mount);
    this.entity = song.href;
    var startAt = Math.max(0, Number(this.session.position) || 0);

    // Armed before the API call, not inside the controller callback: if Spotify
    // never answers at all (blocked, offline, slow), the case must still stop
    // claiming to play. Cleared by the first playback_started.
    if (this.session.playing) {
      window.clearTimeout(this.blockTimer);
      this.blockTimer = window.setTimeout(function () {
        if (!self.root || self.startedOnce) return;
        self.blocked = true;
        self.session.playing = false;
        self.render();
      }, 2500);
    }

    // Mobile Chrome refuses to let a parent start audio in a cross-origin frame
    // unless the frame carries allow="autoplay". The API builds the iframe
    // itself, so stamp the permission on as soon as it appears (same trick as
    // the full player on /sound/).
    stampAutoplayPermission(this.els.host);

    withApi(function (IFrameAPI) {
      if (!self.root || !self.els.host.contains(mount)) return;
      // `url`, NOT `uri`: uri expects a spotify:track:… value, and handing it an
      // https link builds an iframe with an empty src that never plays.
      IFrameAPI.createController(mount, {
        url: song.href,
        width: '100%',
        height: 80
      }, function (controller) {
        self.controller = controller;
        self.attach(controller);
        // Seek first so the resume lands mid-track, then ask for audio. If the
        // browser refuses (no gesture on this page yet), playback_started never
        // fires and the case falls back to TAP TO PLAY rather than lying about
        // being live.
        if (startAt > 1) { try { controller.seek(startAt); } catch (e) {} }
        if (self.session.playing) { try { controller.play(); } catch (e) {} }
      });
    });
  };

  MiniCase.prototype.attach = function (controller) {
    var self = this;
    if (!controller || typeof controller.addListener !== 'function') return;
    controller.addListener('playback_started', function () {
      self.startedOnce = true;
      self.blocked = false;
      window.clearTimeout(self.blockTimer);
      self.session.playing = true;
      self.render();
    });
    controller.addListener('playback_update', function (event) {
      var d = event && event.data;
      if (!d) return;
      if (typeof d.isPaused === 'boolean') self.session.playing = !d.isPaused;
      if (typeof d.duration === 'number' && d.duration > 0) {
        self.session.duration = d.duration / 1000;
        self.session.position = (Number(d.position) || 0) / 1000;
        if (!d.isPaused) self.startedOnce = true;
        // End of track → roll to the next one, same as the full cassette.
        if (self.session.songs.length > 1 && self.session.position >= self.session.duration - 0.4) {
          self.step(1);
          return;
        }
      }
      self.renderPlayState();
      self.renderProgress();
      self.persist(false);
    });
  };

  MiniCase.prototype.toggle = function () {
    this.blocked = false;
    // No controller yet (API slow, blocked, or a previous attempt failed): the
    // press itself is the intent to play, so record that before building the
    // player — resumePlayback only calls play() when the session says playing.
    if (!this.controller) {
      this.session.playing = true;
      this.render();
      this.resumePlayback();
      this.persist(true);
      return;
    }
    try {
      if (this.session.playing) this.controller.pause();
      else this.controller.play();
    } catch (e) {}
    // The controller's own events settle the real state; this is just the
    // immediate feedback for the press.
    this.session.playing = !this.session.playing;
    this.render();
    this.persist(true);
  };

  MiniCase.prototype.step = function (delta) {
    var len = this.session.songs.length;
    if (!len) return;
    this.session.index = (this.session.index + delta + len) % len;
    this.session.position = 0;
    this.session.duration = 0;
    this.session.artUrl = '';
    this.session.playing = true;
    this.startedOnce = false;
    var song = this.song();
    this.entity = song ? song.href : '';
    if (this.controller && song) {
      try {
        // loadEntity takes the https link; loadUri needs a spotify:track:… URI.
        // Passing the wrong shape to either one silently loads nothing.
        if (typeof this.controller.loadEntity === 'function') this.controller.loadEntity(song.href);
        else if (typeof this.controller.loadUri === 'function') this.controller.loadUri(spotifyUri(song.href));
        window.setTimeout(function (c) { return function () { try { c.play(); } catch (e) {} }; }(this.controller), 220);
      } catch (e) {}
    }
    this.render();
    this.renderProgress();
    this.persist(true);
    this.fetchArt();
  };

  // Album art comes from Spotify's oembed, same source the full cassette uses.
  MiniCase.prototype.fetchArt = function () {
    var self = this;
    var song = this.song();
    if (!song || this.session.artUrl) return;
    var href = song.href;
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(href))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var src = data && data.thumbnail_url;
        var current = self.song();
        if (!src || !current || current.href !== href) return;
        self.session.artUrl = src;
        self.render();
        self.persist(true);
      })
      .catch(function () {});
  };

  // Throttled: playback_update fires several times a second.
  MiniCase.prototype.persist = function (force) {
    if (!this.root) return;   // destroyed: nothing left to save for
    var t = nowMs();
    if (!force && t - this.saveAt < 1000) return;
    this.saveAt = t;
    write(this.session);
  };

  // Stop audio and drop the case, but leave the stored session alone — used
  // when handing playback back to the full player on /sound/.
  MiniCase.prototype.destroy = function () {
    window.clearTimeout(this.blockTimer);
    if (this.onPageHide) {
      window.removeEventListener('pagehide', this.onPageHide);
      this.onPageHide = null;
    }
    if (this.controller) {
      try { this.controller.pause(); } catch (e) {}
      try { if (typeof this.controller.destroy === 'function') this.controller.destroy(); } catch (e) {}
    }
    this.controller = null;
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  };

  // Closing is the only thing that ends the roaming session.
  MiniCase.prototype.close = function () {
    this.destroy();
    clear();
  };

  // ── Public surface ────────────────────────────────────────────────────────
  var instance = null;

  var TgbCassette = {
    key: KEY,
    read: read,
    write: write,
    clear: clear,
    injectStyles: injectStyles,
    // Let a page that loaded the IFrame API itself share it with the case.
    setApi: function (IFrameAPI) {
      if (!IFrameAPI || api) return;
      api = IFrameAPI;
      window.__tgbSpotifyIframeApi = IFrameAPI;
      apiWaiters.splice(0).forEach(function (waiter) {
        try { waiter(IFrameAPI); } catch (e) {}
      });
    },
    // Mount the floating case for the stored session, if there is one.
    mount: function (opts) {
      if (instance && instance.root) return instance;
      var session = read();
      if (!session) return null;
      instance = new MiniCase(session, opts || {});
      if (!session.artUrl) instance.fetchArt();
      return instance;
    },
    unmount: function () {
      if (instance) instance.close();
      instance = null;
    },
    // Take the case down WITHOUT ending the session, returning its latest
    // state so the full player can pick the track up where the case left it.
    handoff: function () {
      if (!instance) return read();
      var session = instance.session;
      instance.persist(true);
      instance.destroy();
      instance = null;
      return session;
    }
  };

  window.TgbCassette = TgbCassette;

  function boot() {
    // /sound/ runs its own player and its own in-place minimize; this file is
    // only the store + styles there.
    if (window.TGB_CASSETTE_HOME) return;
    TgbCassette.mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
