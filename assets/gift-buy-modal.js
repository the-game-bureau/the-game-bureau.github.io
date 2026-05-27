// gift-buy-modal — shared "Buy this game" / "Send code" modal.
//
// Flow (unified for /game/run/ landing card and /gifts/ shop):
//   1. intro   — confirms the game + price, "Continue to payment" CTA
//   2. checkout— Stripe Embedded Checkout
//   3. success — shows the issued TGB-XXXX-XXXX code with two actions:
//                  [ Play now ]      → calls redeem-gift-code, marks
//                                       this device as unlocked, closes
//                  [ Send to someone ] → reveals recipient form,
//                                         posts to send-gift-code,
//                                         emails the code via Resend.
//
// Public API:
//   window.TgbGift.openForGame({ id, name, price })
//   window.TgbGift.setGameContext({ id, name, price })   (back-compat)
//   window.TgbGift.open()  /  window.TgbGift.close()
//
// On page load, if URL has ?gift_session=cs_..., we auto-open the
// success step and poll lookup-gift-code until the webhook fires
// (handles the post-Stripe-redirect return URL).
(function (global) {
  'use strict';

  if (global.TgbGift) return;

  var STRIPE_PUBLISHABLE_KEY = 'pk_test_51MF10bBFJf3v75ByzCOFJB7TL7MxnJ8I2ATlm3zszzjek7ki62BrhJ5TI0ZzTLBMk8ixoNUdsoG9pOjM8S1zR8wv00zYSpHYvw';
  var SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var EDGE_BASE = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
  var CREATE_URL = EDGE_BASE + '/create-gift-checkout';
  var LOOKUP_URL = EDGE_BASE + '/lookup-gift-code';
  var REDEEM_URL = EDGE_BASE + '/redeem-gift-code';
  var SEND_URL   = EDGE_BASE + '/send-gift-code';
  var SWAP_URL   = EDGE_BASE + '/swap-gift-game';

  // Matches the ticket-lightbox / directions-lightbox aesthetic: black
  // backdrop, primary-colored top bar, white body. CSS vars fall back
  // to TGB blue when opened on pages without --primary defined.
  var STYLE = [
    '.tgb-gift-modal{display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.88);flex-direction:column;font-family:"Outfit","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--tgb-gift-primary:var(--primary,#2d4880);--tgb-gift-secondary:var(--secondary,#ffffff);}',
    '.tgb-gift-modal.is-open{display:flex;}',
    '.tgb-gift-bar{display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top),0.75rem) 1rem 0.75rem;flex-shrink:0;background:var(--tgb-gift-primary);}',
    '.tgb-gift-title{font-family:"Outfit",sans-serif;font-weight:700;font-size:1rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--tgb-gift-secondary);margin:0;}',
    '.tgb-gift-close{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.18);border:2px solid var(--tgb-gift-secondary);color:var(--tgb-gift-secondary);font-size:1.2rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s,transform 0.15s;font:inherit;}',
    '.tgb-gift-close:active{background:rgba(255,255,255,0.32);transform:scale(0.94);}',
    '.tgb-gift-body{flex:1;overflow-y:auto;padding:1.5rem 1.5rem max(env(safe-area-inset-bottom),2rem);background:#fff;font-family:"DM Sans",sans-serif;font-size:1rem;line-height:1.6;color:#333;}',
    '.tgb-gift-step{display:none;max-width:520px;margin:0 auto;}',
    '.tgb-gift-step.is-active{display:block;}',
    '.tgb-gift-headline{margin:0 0 0.4rem;font-family:"Outfit",sans-serif;font-size:1.5rem;font-weight:700;color:var(--tgb-gift-primary);letter-spacing:0.01em;line-height:1.15;}',
    '.tgb-gift-sub{margin:0 0 1.25rem;color:#555;font-size:0.98rem;line-height:1.55;}',
    '.tgb-gift-price{font-family:"Outfit",sans-serif;font-size:2.4rem;font-weight:700;color:var(--tgb-gift-primary);-webkit-text-stroke:0.6px var(--tgb-gift-secondary);paint-order:stroke fill;letter-spacing:0.01em;margin:0.25rem 0 1rem;}',
    '.tgb-gift-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:0.95rem 1.25rem;border:0;border-radius:999px;background:var(--tgb-gift-primary);color:var(--tgb-gift-secondary);font-family:"Outfit",sans-serif;font-size:1rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;transition:transform 0.1s,opacity 0.15s;font:inherit;font-size:0.95rem;}',
    '.tgb-gift-cta:active{transform:scale(0.985);}',
    '.tgb-gift-cta:disabled{opacity:0.55;cursor:progress;}',
    '.tgb-gift-cta--secondary{background:transparent;color:var(--tgb-gift-primary);border:2px solid var(--tgb-gift-primary);}',
    '.tgb-gift-cta--secondary:hover{background:var(--tgb-gift-primary);color:var(--tgb-gift-secondary);}',
    '.tgb-gift-actions{display:grid;gap:0.6rem;margin-top:1rem;}',
    '.tgb-gift-error{margin:0;color:#c23737;font-size:0.92rem;min-height:1.2em;font-weight:600;}',
    '.tgb-gift-checkout{min-height:380px;}',
    '.tgb-gift-code-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin:0.5rem 0 1.5rem;padding:1rem 1.1rem;border:2px dashed var(--tgb-gift-primary);border-radius:14px;background:rgba(0,0,0,0.02);font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-size:1.35rem;font-weight:700;letter-spacing:0.04em;color:var(--tgb-gift-primary);}',
    '.tgb-gift-copy{padding:0.45rem 0.9rem;border:1.5px solid var(--tgb-gift-primary);border-radius:8px;background:transparent;color:var(--tgb-gift-primary);font:inherit;font-family:"Outfit",sans-serif;font-size:0.74rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;transition:background 0.15s,color 0.15s;}',
    '.tgb-gift-copy:hover{background:var(--tgb-gift-primary);color:var(--tgb-gift-secondary);}',
    '.tgb-gift-help{margin:0.5rem 0 0;color:#555;font-size:0.92rem;line-height:1.55;}',
    '.tgb-gift-send-form{display:none;margin-top:1.25rem;padding:1.1rem;border:1.5px solid rgba(0,0,0,0.12);border-radius:14px;background:rgba(0,0,0,0.025);}',
    '.tgb-gift-send-form.is-open{display:block;}',
    '.tgb-gift-send-form-title{margin:0 0 0.9rem;font-family:"Outfit",sans-serif;font-size:1.05rem;font-weight:700;color:var(--tgb-gift-primary);letter-spacing:0.04em;text-transform:uppercase;}',
    '.tgb-gift-field{display:grid;gap:0.35rem;margin-bottom:0.7rem;}',
    '.tgb-gift-field label{font-family:"Outfit",sans-serif;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--tgb-gift-primary);}',
    '.tgb-gift-field input,.tgb-gift-field textarea{width:100%;padding:0.65rem 0.8rem;border:1.5px solid rgba(0,0,0,0.18);border-radius:10px;background:#fff;color:#222;font:inherit;font-size:0.98rem;font-family:"DM Sans",sans-serif;}',
    '.tgb-gift-field textarea{min-height:64px;resize:vertical;}',
    '.tgb-gift-field input:focus,.tgb-gift-field textarea:focus{outline:none;border-color:var(--tgb-gift-primary);box-shadow:0 0 0 3px rgba(0,0,0,0.06);}',
    '.tgb-gift-sent{margin:0;padding:0.85rem 1rem;border-radius:10px;background:#e8f4ec;border:1px solid #aed4bb;color:#2f6b3d;font-weight:600;}',
    '.tgb-gift-have-code{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(0,0,0,0.12);}',
    '.tgb-gift-have-code-toggle{background:transparent;border:0;padding:0;color:var(--tgb-gift-primary);font-family:"Outfit",sans-serif;font-size:0.85rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;text-decoration:underline;}',
    '.tgb-gift-have-code-toggle:hover{opacity:0.8;}',
    '.tgb-gift-have-code-form{display:none;margin-top:0.8rem;}',
    '.tgb-gift-have-code-form.is-open{display:block;}',
    '.tgb-gift-have-code-row{display:flex;gap:0.5rem;}',
    '.tgb-gift-have-code-input{flex:1 1 auto;min-width:0;padding:0.65rem 0.8rem;border:1.5px solid rgba(0,0,0,0.18);border-radius:10px;background:#fff;color:#222;font:inherit;font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-size:1rem;letter-spacing:0.04em;text-transform:uppercase;}',
    '.tgb-gift-have-code-input:focus{outline:none;border-color:var(--tgb-gift-primary);box-shadow:0 0 0 3px rgba(0,0,0,0.06);}',
    '.tgb-gift-have-code-input--error{border-color:#c23737;animation:tgbGiftShake 0.4s ease;}',
    '@keyframes tgbGiftShake{0%,100%{transform:translateX(0);}25%{transform:translateX(-5px);}75%{transform:translateX(5px);}}',
    '.tgb-gift-have-code-apply{flex:0 0 auto;padding:0 1rem;border:1.5px solid var(--tgb-gift-primary);border-radius:10px;background:transparent;color:var(--tgb-gift-primary);font:inherit;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;}',
    '.tgb-gift-have-code-apply:hover:not(:disabled){background:var(--tgb-gift-primary);color:var(--tgb-gift-secondary);}',
    '.tgb-gift-have-code-apply:disabled,.tgb-gift-have-code-input:disabled{opacity:0.5;cursor:progress;}',
    '.tgb-gift-choose-list{display:grid;gap:0.55rem;margin-top:0.5rem;}',
    '.tgb-gift-choose-item{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.9rem 1rem;border:1.5px solid rgba(0,0,0,0.15);border-radius:12px;background:#fff;cursor:pointer;font:inherit;text-align:left;transition:border-color 0.15s,transform 0.1s,background 0.15s;}',
    '.tgb-gift-choose-item:hover{border-color:var(--tgb-gift-primary);background:rgba(0,0,0,0.02);}',
    '.tgb-gift-choose-item:active{transform:scale(0.99);}',
    '.tgb-gift-choose-name{font-family:"Outfit",sans-serif;font-weight:700;font-size:1rem;color:var(--tgb-gift-primary);letter-spacing:0.01em;}',
    '.tgb-gift-choose-price{font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-size:0.92rem;font-weight:600;color:#555;flex-shrink:0;}',
    '.tgb-gift-choose-empty{padding:1.5rem;text-align:center;color:#666;font-size:0.95rem;border:1.5px dashed rgba(0,0,0,0.15);border-radius:12px;}',
    '.tgb-gift-swap-link{display:block;margin:1.25rem auto 0;padding:0;border:0;background:transparent;color:var(--tgb-gift-primary);font:inherit;font-family:"Outfit",sans-serif;font-size:0.82rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-decoration:underline;cursor:pointer;text-align:center;}',
    '.tgb-gift-swap-link:hover{opacity:0.8;}',
    '.tgb-gift-swap-code{margin:0 0 0.75rem;font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-size:1.05rem;font-weight:700;color:var(--tgb-gift-primary);letter-spacing:0.04em;}'
  ].join('');

  var HTML = [
    '<div class="tgb-gift-bar">',
    '  <h2 class="tgb-gift-title" id="tgbGiftTitle">Buy this game</h2>',
    '  <button type="button" class="tgb-gift-close" id="tgbGiftCloseBtn" aria-label="Close">&#x2715;</button>',
    '</div>',
    '<div class="tgb-gift-body">',

    // ── Step 0: chooser (only used when opened via openForChoice) ────
    '  <div class="tgb-gift-step" id="tgbGiftStepChoose">',
    '    <h3 class="tgb-gift-headline">Choose a game</h3>',
    '    <p class="tgb-gift-sub">Pick which game you’d like to gift. After payment you can play it yourself or send the code to someone.</p>',
    '    <div class="tgb-gift-choose-list" id="tgbGiftChooseList"></div>',
    '  </div>',

    // ── Step S: swap (entered via /?swap=CODE or the success link) ───
    '  <div class="tgb-gift-step" id="tgbGiftStepSwap">',
    '    <h3 class="tgb-gift-headline">Swap to a different game</h3>',
    '    <p class="tgb-gift-sub">Pick the game you want instead. Your code stays the same and now unlocks the new game.</p>',
    '    <p class="tgb-gift-swap-code" id="tgbGiftSwapCodeLabel"></p>',
    '    <p class="tgb-gift-error" id="tgbGiftSwapError" aria-live="polite"></p>',
    '    <div class="tgb-gift-choose-list" id="tgbGiftSwapList"></div>',
    '  </div>',

    // ── Step 1: intro ────────────────────────────────────────────────
    '  <div class="tgb-gift-step is-active" id="tgbGiftStepIntro">',
    '    <h3 class="tgb-gift-headline" id="tgbGiftIntroHeadline">Buy this game</h3>',
    '    <p class="tgb-gift-price" id="tgbGiftIntroPrice" hidden>&mdash;</p>',
    '    <p class="tgb-gift-sub" id="tgbGiftIntroSub">After payment you’ll get a one-time code. Play it yourself, or send it to someone as a gift.</p>',
    '    <form class="tgb-gift-form" id="tgbGiftIntroForm" autocomplete="on">',
    '      <div class="tgb-gift-field">',
    '        <label for="tgbGiftBuyerEmail">Your email (for the receipt)</label>',
    '        <input id="tgbGiftBuyerEmail" name="buyer_email" type="email" required autocomplete="email">',
    '      </div>',
    '    </form>',
    '    <p class="tgb-gift-error" id="tgbGiftIntroError" aria-live="polite"></p>',
    '    <button type="button" class="tgb-gift-cta" id="tgbGiftContinueBtn">Continue to payment</button>',
    '    <div class="tgb-gift-have-code">',
    '      <button type="button" class="tgb-gift-have-code-toggle" id="tgbGiftHaveCodeToggle" aria-expanded="false">Have a code?</button>',
    '      <div class="tgb-gift-have-code-form" id="tgbGiftHaveCodeForm">',
    '        <div class="tgb-gift-have-code-row">',
    '          <input id="tgbGiftHaveCodeInput" class="tgb-gift-have-code-input" type="text" maxlength="14" placeholder="TGB-XXXX-XXXX" autocomplete="off" autocorrect="off" spellcheck="false">',
    '          <button type="button" class="tgb-gift-have-code-apply" id="tgbGiftHaveCodeApply">Apply</button>',
    '        </div>',
    '        <p class="tgb-gift-error" id="tgbGiftHaveCodeError" aria-live="polite"></p>',
    '      </div>',
    '    </div>',
    '  </div>',

    // ── Step 2: Stripe Embedded Checkout ─────────────────────────────
    '  <div class="tgb-gift-step" id="tgbGiftStepCheckout">',
    '    <p class="tgb-gift-sub">Pay securely via Stripe to issue the code.</p>',
    '    <div class="tgb-gift-checkout" id="tgbGiftCheckoutMount"></div>',
    '  </div>',

    // ── Step 3: success + actions ────────────────────────────────────
    '  <div class="tgb-gift-step" id="tgbGiftStepSuccess">',
    '    <h3 class="tgb-gift-headline" id="tgbGiftSuccessHeadline">Payment confirmed</h3>',
    '    <p class="tgb-gift-sub" id="tgbGiftSuccessSub">Here’s your one-time code.</p>',
    '    <div class="tgb-gift-code-row">',
    '      <span id="tgbGiftSuccessCode">&mdash;</span>',
    '      <button type="button" class="tgb-gift-copy" id="tgbGiftCopyBtn">Copy</button>',
    '    </div>',
    '    <div class="tgb-gift-actions">',
    '      <button type="button" class="tgb-gift-cta" id="tgbGiftPlayNowBtn">Play now</button>',
    '      <button type="button" class="tgb-gift-cta tgb-gift-cta--secondary" id="tgbGiftPlayLaterBtn">Play later</button>',
    '      <button type="button" class="tgb-gift-cta tgb-gift-cta--secondary" id="tgbGiftSendOpenBtn">Send to someone</button>',
    '    </div>',
    '    <button type="button" class="tgb-gift-swap-link" id="tgbGiftSuccessSwapBtn">Got the wrong game? Swap →</button>',
    '    <p class="tgb-gift-error" id="tgbGiftSuccessError" aria-live="polite"></p>',

    // Send-form (collapsed by default, expanded when [Send to someone] is clicked)
    '    <div class="tgb-gift-send-form" id="tgbGiftSendForm">',
    '      <p class="tgb-gift-send-form-title">Send the code by email</p>',
    '      <form id="tgbGiftSendFormEl" autocomplete="on">',
    '        <div class="tgb-gift-field">',
    '          <label for="tgbGiftRecipientEmail">Recipient email</label>',
    '          <input id="tgbGiftRecipientEmail" name="recipient_email" type="email" required autocomplete="email">',
    '        </div>',
    '        <div class="tgb-gift-field">',
    '          <label for="tgbGiftRecipientName">Recipient name (optional)</label>',
    '          <input id="tgbGiftRecipientName" name="recipient_name" type="text" autocomplete="name">',
    '        </div>',
    '        <div class="tgb-gift-field">',
    '          <label for="tgbGiftMessage">Message (optional)</label>',
    '          <textarea id="tgbGiftMessage" name="message" maxlength="500" placeholder="Have fun out there."></textarea>',
    '        </div>',
    '        <p class="tgb-gift-error" id="tgbGiftSendError" aria-live="polite"></p>',
    '        <button type="submit" class="tgb-gift-cta" id="tgbGiftSendSubmitBtn">Send code</button>',
    '      </form>',
    '      <p class="tgb-gift-sent" id="tgbGiftSentNotice" hidden></p>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');

  var state = {
    game: null,
    stripe: null,
    checkout: null,
    loadingStripe: null,
    root: null,
    injected: false,
    sessionId: '',     // set when create-gift-checkout returns, or pulled from ?gift_session=
    code: '',          // set when lookup or webhook produces a code
    redeemed: false    // local-only flag: this browser already used Play Now
  };

  function $(id) { return document.getElementById(id); }

  function ensureInjected() {
    if (state.injected) return;
    state.injected = true;
    var style = document.createElement('style');
    style.id = 'tgb-gift-modal-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
    var root = document.createElement('div');
    root.className = 'tgb-gift-modal';
    root.id = 'tgbGiftModal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tgbGiftTitle');
    root.innerHTML = HTML;
    document.body.appendChild(root);
    state.root = root;
    wireEvents();
  }

  function showStep(stepId) {
    state.root.querySelectorAll('.tgb-gift-step').forEach(function (el) {
      el.classList.toggle('is-active', el.id === stepId);
    });
  }

  function setError(id, message) {
    var el = $(id);
    if (el) el.textContent = message || '';
  }

  function open(initialStep) {
    ensureInjected();
    state.root.classList.add('is-open');
    showStep(initialStep || 'tgbGiftStepIntro');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!state.root) return;
    var wasOpen = state.root.classList.contains('is-open');
    state.root.classList.remove('is-open');
    document.body.style.overflow = '';
    if (state.checkout && typeof state.checkout.destroy === 'function') {
      try { state.checkout.destroy(); } catch (_) {}
      state.checkout = null;
    }
    setError('tgbGiftIntroError', '');
    setError('tgbGiftSuccessError', '');
    setError('tgbGiftSendError', '');
    setError('tgbGiftHaveCodeError', '');
    var mount = $('tgbGiftCheckoutMount');
    if (mount) mount.innerHTML = '';
    var sendForm = $('tgbGiftSendForm');
    if (sendForm) sendForm.classList.remove('is-open');
    var haveCodeForm = $('tgbGiftHaveCodeForm');
    if (haveCodeForm) haveCodeForm.classList.remove('is-open');
    var haveCodeToggle = $('tgbGiftHaveCodeToggle');
    if (haveCodeToggle) haveCodeToggle.setAttribute('aria-expanded', 'false');
    var sentNotice = $('tgbGiftSentNotice');
    if (sentNotice) sentNotice.hidden = true;
    var sendFormEl = $('tgbGiftSendFormEl');
    if (sendFormEl) {
      sendFormEl.style.display = '';
      try { sendFormEl.reset(); } catch (_) {}
    }
    if (wasOpen) emit('tgb-gift-closed', { redeemed: state.redeemed });
  }

  // ── Event bus: tell the host page when the modal redeems or closes
  // so engines / landing pages can continue the gameplay flow.
  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function applyGameContext(game) {
    ensureInjected();
    state.game = game || null;
    var headline = $('tgbGiftIntroHeadline');
    var sub = $('tgbGiftIntroSub');
    var priceEl = $('tgbGiftIntroPrice');
    if (game && game.name && headline) {
      headline.textContent = game.name;
    } else if (headline) {
      headline.textContent = 'Buy this game';
    }
    if (priceEl) {
      if (game && game.price) {
        priceEl.textContent = game.price;
        priceEl.hidden = false;
      } else {
        priceEl.hidden = true;
      }
    }
    if (sub) {
      sub.textContent = 'After payment you’ll get a one-time code. Play it yourself, or send it to someone as a gift.';
    }
  }

  function openForGame(game) {
    applyGameContext(game);
    state.sessionId = '';
    state.code = '';
    state.redeemed = false;
    open('tgbGiftStepIntro');
  }

  // Open the modal at the chooser step, where the buyer picks a game
  // from a list. Used by the "Gift Card — Any Game" tile in /gifts/.
  // Once a game is picked, we route through the same intro → Stripe →
  // success flow as openForGame.
  function openForChoice(opts) {
    ensureInjected();
    state.game = null;
    state.sessionId = '';
    state.code = '';
    state.redeemed = false;
    var games = (opts && Array.isArray(opts.games)) ? opts.games : [];
    renderChoiceList(games);
    open('tgbGiftStepChoose');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderChoiceList(games) {
    var list = $('tgbGiftChooseList');
    if (!list) return;
    list.innerHTML = '';
    if (!games.length) {
      var empty = document.createElement('div');
      empty.className = 'tgb-gift-choose-empty';
      empty.textContent = 'No games are available to gift right now.';
      list.appendChild(empty);
      return;
    }
    games.forEach(function (game) {
      if (!game || !game.id) return;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'tgb-gift-choose-item';
      item.innerHTML =
        '<span class="tgb-gift-choose-name">' + escapeHtml(game.name || 'Untitled') + '</span>' +
        '<span class="tgb-gift-choose-price">' + escapeHtml(game.price || '') + '</span>';
      item.addEventListener('click', function () {
        applyGameContext({
          id:    game.id,
          name:  game.name || '',
          price: game.price || ''
        });
        showStep('tgbGiftStepIntro');
      });
      list.appendChild(item);
    });
  }

  // Open the modal at the swap step. Used from the success-step link
  // (post-purchase) and from /?swap=CODE links in the buyer-receipt
  // email. Caller may supply a games list; if not, we fetch from
  // Supabase ourselves.
  async function openForSwap(opts) {
    ensureInjected();
    var code = (opts && opts.code) ? String(opts.code).toUpperCase() : '';
    state.code = code;
    state.game = null;
    state.sessionId = '';
    state.redeemed = false;
    var label = $('tgbGiftSwapCodeLabel');
    if (label) label.textContent = code ? 'Code: ' + code : '';
    setError('tgbGiftSwapError', '');
    open('tgbGiftStepSwap');
    var games = (opts && Array.isArray(opts.games)) ? opts.games : null;
    if (!games) games = await fetchPaidGamesFallback();
    renderSwapList(games);
  }

  async function fetchPaidGamesFallback() {
    try {
      var url = SUPABASE_URL + '/rest/v1/games?select=id,name,price,archived&apikey=sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
      var response = await fetch(url, {
        headers: {
          apikey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3',
          Accept: 'application/json'
        },
        cache: 'no-store'
      });
      if (!response.ok) return [];
      var rows = await response.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .filter(function (g) {
          var price = String(g.price || '').trim();
          if (!price || price.toUpperCase() === 'FREE') return false;
          var archived = String(g.archived || '').trim().toUpperCase();
          if (archived === 'YES') return false;
          var numeric = price.replace(/[^0-9.]/g, '');
          var dollars = parseFloat(numeric);
          return Number.isFinite(dollars) && dollars > 0;
        })
        .sort(function (a, b) {
          return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
    } catch (_) {
      return [];
    }
  }

  function renderSwapList(games) {
    var list = $('tgbGiftSwapList');
    if (!list) return;
    list.innerHTML = '';
    if (!games.length) {
      var empty = document.createElement('div');
      empty.className = 'tgb-gift-choose-empty';
      empty.textContent = 'No swappable games available right now.';
      list.appendChild(empty);
      return;
    }
    games.forEach(function (game) {
      if (!game || !game.id) return;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'tgb-gift-choose-item';
      item.innerHTML =
        '<span class="tgb-gift-choose-name">' + escapeHtml(game.name || 'Untitled') + '</span>' +
        '<span class="tgb-gift-choose-price">' + escapeHtml(game.price || '') + '</span>';
      item.addEventListener('click', function () { performSwap(game); });
      list.appendChild(item);
    });
  }

  async function performSwap(game) {
    setError('tgbGiftSwapError', '');
    if (!state.code) {
      setError('tgbGiftSwapError', 'Missing code.');
      return;
    }
    var items = state.root.querySelectorAll('#tgbGiftSwapList .tgb-gift-choose-item');
    items.forEach(function (el) { el.disabled = true; });
    try {
      var response = await fetch(SWAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.code, new_game_id: game.id })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data || !data.ok) {
        var message = (data && data.message) || (data && data.reason)
          || 'Could not swap.';
        throw new Error(String(message));
      }
      // Move into the existing success step with the new game in
      // context so Play now / Send to someone work immediately.
      applyGameContext({
        id:    data.game_id || game.id,
        name:  data.game_name || game.name || '',
        price: data.price || game.price || ''
      });
      var codeEl = $('tgbGiftSuccessCode');
      if (codeEl) codeEl.textContent = state.code;
      var subEl = $('tgbGiftSuccessSub');
      if (subEl) subEl.textContent = 'Swapped to "' + (data.game_name || game.name) + '". Your code now unlocks this game.';
      showStep('tgbGiftStepSuccess');
    } catch (error) {
      console.error(error);
      setError('tgbGiftSwapError', error.message || 'Swap failed.');
    } finally {
      items.forEach(function (el) { el.disabled = false; });
    }
  }

  // Detect ?swap=CODE on page load (linked from the buyer-receipt
  // email or the /gifts/ shop) and open the modal at the swap step.
  function maybeOpenSwapFromUrl() {
    var params = new URLSearchParams(global.location.search);
    var swapCode = params.get('swap');
    if (!swapCode) return false;
    openForSwap({ code: swapCode });
    return true;
  }

  function loadStripeJs() {
    if (global.Stripe) return Promise.resolve(global.Stripe);
    if (state.loadingStripe) return state.loadingStripe;
    state.loadingStripe = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3';
      script.async = true;
      script.onload = function () {
        if (global.Stripe) resolve(global.Stripe);
        else reject(new Error('Stripe.js loaded but global Stripe missing.'));
      };
      script.onerror = function () { reject(new Error('Could not load Stripe.js.')); };
      document.head.appendChild(script);
    });
    return state.loadingStripe;
  }

  async function handleContinue() {
    setError('tgbGiftIntroError', '');
    if (!state.game || !state.game.id) {
      setError('tgbGiftIntroError', 'No game selected.');
      return;
    }
    var emailInput = $('tgbGiftBuyerEmail');
    var buyerEmail = emailInput ? emailInput.value.trim() : '';
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      setError('tgbGiftIntroError', 'Enter a valid email for your receipt.');
      if (emailInput) {
        try { emailInput.focus(); } catch (_) {}
      }
      return;
    }
    state.buyerEmail = buyerEmail;
    var btn = $('tgbGiftContinueBtn');
    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = 'Loading...';
    try {
      var response = await fetch(CREATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id:     state.game.id,
          buyer_email: buyerEmail
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Could not start checkout.');
      if (!data.client_secret) throw new Error('Missing client_secret from server.');
      state.sessionId = data.session_id || '';
      // Code is issued at session-create time now (not at webhook time),
      // so we already have it before Stripe even loads. Stash it.
      if (data.code) state.code = String(data.code);
      await mountStripeCheckout(data.client_secret);
      showStep('tgbGiftStepCheckout');
    } catch (error) {
      console.error(error);
      setError('tgbGiftIntroError', error.message || 'Something went wrong. Try again?');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  async function mountStripeCheckout(clientSecret) {
    var Stripe = await loadStripeJs();
    if (!state.stripe) state.stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    var mount = $('tgbGiftCheckoutMount');
    mount.innerHTML = '';
    state.checkout = await state.stripe.initEmbeddedCheckout({
      clientSecret: clientSecret,
      // Fired when Stripe confirms payment. We stay in-modal and
      // transition to the success step. The code was already issued by
      // create-gift-checkout (state.code), so we show it instantly —
      // no polling required. The webhook in parallel transitions the
      // row to paid; Play now / Send-to-someone briefly retry if they
      // race ahead of the webhook.
      onComplete: function () {
        if (state.code) {
          var codeEl = $('tgbGiftSuccessCode');
          if (codeEl) codeEl.textContent = state.code;
        }
        showStep('tgbGiftStepSuccess');
        if (!state.code && state.sessionId) pollForCode(state.sessionId);
      }
    });
    state.checkout.mount('#tgbGiftCheckoutMount');
  }

  async function lookupSession(sessionId) {
    var response = await fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    if (!response.ok) throw new Error('Lookup failed (' + response.status + ')');
    return response.json();
  }

  async function pollForCode(sessionId) {
    var codeEl = $('tgbGiftSuccessCode');
    var subEl  = $('tgbGiftSuccessSub');
    if (codeEl) codeEl.textContent = 'Generating code...';
    if (subEl)  subEl.textContent  = 'Confirming your payment...';
    for (var attempt = 0; attempt < 12; attempt++) {
      try {
        var row = await lookupSession(sessionId);
        if (row && row.code) {
          state.code = row.code;
          if (codeEl) codeEl.textContent = row.code;
          if (subEl)  subEl.textContent  = 'Here’s your one-time code.';
          return;
        }
      } catch (_) { /* keep polling */ }
      await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }
    if (codeEl) codeEl.textContent = '—';
    if (subEl)  subEl.textContent  = 'Payment confirmed but the code is still being generated. Refresh in a moment.';
  }

  function maybeOpenSuccessFromUrl() {
    var params = new URLSearchParams(global.location.search);
    var sessionId = params.get('gift_session');
    if (!sessionId) return;
    ensureInjected();
    state.sessionId = sessionId;
    state.code = '';
    state.redeemed = false;
    open('tgbGiftStepSuccess');
    pollForCode(sessionId);
  }

  // Helper: redeem with a brief retry to cover the case where the
  // Stripe webhook hasn't yet flipped the row from pending → paid.
  async function attemptRedeem(code, gameId) {
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        var response = await fetch(REDEEM_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, game_id: gameId })
        });
        var data = await response.json().catch(function () { return {}; });
        if (response.ok && data && data.ok) return { ok: true };
        // already_redeemed isn't fatal — bearer-token policy already
        // accepts repeat use, but defensive code retained.
        if (data && data.reason === 'already_redeemed') return { ok: true };
        // code_not_payable means status is still pending; wait + retry.
        if (data && data.reason === 'code_not_payable') {
          await new Promise(function (r) { setTimeout(r, 1500); });
          continue;
        }
        return { ok: false, reason: (data && data.reason) || 'redeem_failed' };
      } catch (_) {
        await new Promise(function (r) { setTimeout(r, 1500); });
      }
    }
    return { ok: false, reason: 'timeout' };
  }

  // ── Action: Play now (auto-redeem on this device) ───────────────────
  async function handlePlayNow() {
    setError('tgbGiftSuccessError', '');
    if (!state.code) {
      setError('tgbGiftSuccessError', 'Code not ready yet — try again in a moment.');
      return;
    }
    if (!state.game || !state.game.id) {
      try {
        var row = await lookupSession(state.sessionId);
        if (row && row.game_id) {
          state.game = { id: row.game_id, name: row.game_name || '', price: '' };
        }
      } catch (_) {}
    }
    if (!state.game || !state.game.id) {
      setError('tgbGiftSuccessError', 'Could not determine which game to unlock.');
      return;
    }
    var btn = $('tgbGiftPlayNowBtn');
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = 'Unlocking...';
    try {
      var result = await attemptRedeem(state.code, state.game.id);
      if (!result.ok) {
        var reason = String(result.reason || 'redeem failed').replace(/_/g, ' ');
        throw new Error('Could not unlock (' + reason + ').');
      }
      state.redeemed = true;
      try {
        var key = 'tgb_' + state.game.id + '_checkout_unlocks';
        var existing = {};
        try { existing = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
        existing['gift:' + state.code] = {
          unlockedAt: new Date().toISOString(),
          accessCode: state.code,
          sourceUrl: '',
          orderId: ''
        };
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (_) {}
      emit('tgb-gift-redeemed', { game_id: state.game.id, code: state.code, source: 'play_now' });
      close();
      var onGamePage = /\/game\/run\//.test(global.location.pathname);
      if (!onGamePage) {
        global.location.href = '/game/run/?id=' + encodeURIComponent(state.game.id);
      }
    } catch (error) {
      console.error(error);
      setError('tgbGiftSuccessError', error.message || 'Could not unlock.');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // ── Action: Play later (just close; buyer keeps the code) ───────────
  function handlePlayLater() {
    setError('tgbGiftSuccessError', '');
    // Don't auto-redeem — the buyer wants to use the code later
    // (probably on another device, or when they're ready to play).
    // The buyer-receipt email from the webhook gives them a copy.
    close();
  }

  // ── Action: Send to someone (reveal form, post send-gift-code) ──────
  function openSendForm() {
    var form = $('tgbGiftSendForm');
    if (form) form.classList.add('is-open');
    setError('tgbGiftSendError', '');
    setTimeout(function () {
      var input = $('tgbGiftRecipientEmail');
      if (input) input.focus();
    }, 0);
  }

  async function handleSendSubmit(event) {
    event.preventDefault();
    setError('tgbGiftSendError', '');
    if (!state.sessionId) {
      setError('tgbGiftSendError', 'Missing session id.');
      return;
    }
    var recipient = $('tgbGiftRecipientEmail').value.trim();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setError('tgbGiftSendError', 'Enter a valid recipient email.');
      return;
    }
    var submitBtn = $('tgbGiftSendSubmitBtn');
    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    try {
      var body = {
        session_id:      state.sessionId,
        recipient_email: recipient,
        recipient_name:  $('tgbGiftRecipientName').value.trim(),
        message:         $('tgbGiftMessage').value.trim()
      };
      var response = await fetch(SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data || !data.ok) {
        var reason = (data && (data.error || data.reason)) || 'send failed';
        throw new Error(String(reason));
      }
      // Hide the form, show a confirmation in its place.
      var formEl = $('tgbGiftSendFormEl');
      if (formEl) formEl.style.display = 'none';
      var sent = $('tgbGiftSentNotice');
      if (sent) {
        sent.textContent = 'Email sent to ' + recipient + '.';
        sent.hidden = false;
      }
    } catch (error) {
      console.error(error);
      setError('tgbGiftSendError', error.message || 'Could not send.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  }

  // ── Action: Have a code? (skip Stripe, redeem directly) ────────────
  function toggleHaveCodeForm() {
    var form = $('tgbGiftHaveCodeForm');
    var toggle = $('tgbGiftHaveCodeToggle');
    if (!form) return;
    var isOpen = form.classList.toggle('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      setError('tgbGiftHaveCodeError', '');
      setTimeout(function () {
        var input = $('tgbGiftHaveCodeInput');
        if (input) input.focus();
      }, 0);
    }
  }

  var GIFT_CODE_REGEX = /^TGB-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/;

  async function handleHaveCodeApply() {
    setError('tgbGiftHaveCodeError', '');
    var input = $('tgbGiftHaveCodeInput');
    var applyBtn = $('tgbGiftHaveCodeApply');
    var raw = String((input && input.value) || '').trim().toUpperCase();
    if (!raw) return;
    if (!GIFT_CODE_REGEX.test(raw)) {
      setError('tgbGiftHaveCodeError', 'Codes look like TGB-XXXX-XXXX.');
      if (input) {
        input.classList.add('tgb-gift-have-code-input--error');
        setTimeout(function () { input.classList.remove('tgb-gift-have-code-input--error'); }, 700);
      }
      return;
    }
    if (!state.game || !state.game.id) {
      setError('tgbGiftHaveCodeError', 'No game selected.');
      return;
    }
    applyBtn.disabled = true;
    input.disabled = true;
    var originalLabel = applyBtn.textContent;
    applyBtn.textContent = 'Checking...';
    try {
      var response = await fetch(REDEEM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: raw, game_id: state.game.id })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data || !data.ok) {
        var reason = (data && data.reason) ? String(data.reason).replace(/_/g, ' ') : 'not valid';
        setError('tgbGiftHaveCodeError', 'Code could not be redeemed (' + reason + ').');
        input.classList.add('tgb-gift-have-code-input--error');
        setTimeout(function () { input.classList.remove('tgb-gift-have-code-input--error'); }, 700);
        return;
      }
      // Save the unlock to localStorage so the engine doesn't re-prompt.
      try {
        var key = 'tgb_' + state.game.id + '_checkout_unlocks';
        var existing = {};
        try { existing = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
        existing['gift:' + raw] = {
          unlockedAt: new Date().toISOString(),
          accessCode: raw,
          sourceUrl: '',
          orderId: ''
        };
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (_) {}
      state.code = raw;
      state.redeemed = true;
      emit('tgb-gift-redeemed', { game_id: state.game.id, code: raw, source: 'have_code' });
      close();
    } catch (error) {
      console.error(error);
      setError('tgbGiftHaveCodeError', 'Network error — try again.');
    } finally {
      applyBtn.disabled = false;
      input.disabled = false;
      applyBtn.textContent = originalLabel;
    }
  }

  function wireEvents() {
    var modal = state.root;
    var closeBtn = $('tgbGiftCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (modal) modal.addEventListener('click', function (event) {
      if (event.target === modal) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) close();
    });

    var continueBtn = $('tgbGiftContinueBtn');
    if (continueBtn) continueBtn.addEventListener('click', handleContinue);

    var haveCodeToggle = $('tgbGiftHaveCodeToggle');
    if (haveCodeToggle) haveCodeToggle.addEventListener('click', toggleHaveCodeForm);
    var haveCodeApply = $('tgbGiftHaveCodeApply');
    if (haveCodeApply) haveCodeApply.addEventListener('click', handleHaveCodeApply);
    var haveCodeInput = $('tgbGiftHaveCodeInput');
    if (haveCodeInput) haveCodeInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleHaveCodeApply();
      }
    });

    var playBtn = $('tgbGiftPlayNowBtn');
    if (playBtn) playBtn.addEventListener('click', handlePlayNow);

    var playLaterBtn = $('tgbGiftPlayLaterBtn');
    if (playLaterBtn) playLaterBtn.addEventListener('click', handlePlayLater);

    var sendOpenBtn = $('tgbGiftSendOpenBtn');
    if (sendOpenBtn) sendOpenBtn.addEventListener('click', openSendForm);

    var successSwapBtn = $('tgbGiftSuccessSwapBtn');
    if (successSwapBtn) successSwapBtn.addEventListener('click', function () {
      if (!state.code) return;
      openForSwap({ code: state.code });
    });

    var sendForm = $('tgbGiftSendFormEl');
    if (sendForm) sendForm.addEventListener('submit', handleSendSubmit);

    var copyBtn = $('tgbGiftCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', async function () {
      var code = ($('tgbGiftSuccessCode').textContent || '').trim();
      if (!code || code === '—' || /Generating/i.test(code)) return;
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1800);
      } catch (_) {}
    });
  }

  global.TgbGift = {
    openForGame:   openForGame,
    openForChoice: openForChoice,
    openForSwap:   openForSwap,
    open: function (step) { ensureInjected(); open(step); },
    close: close,
    setGameContext: applyGameContext
  };

  function maybeAutoOpen() {
    // ?swap=CODE wins (from the buyer-receipt email "Wrong game?" link).
    // Otherwise we still honour the legacy ?gift_session= path for
    // backwards compatibility.
    if (maybeOpenSwapFromUrl()) return;
    maybeOpenSuccessFromUrl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoOpen);
  } else {
    maybeAutoOpen();
  }
}(window));
