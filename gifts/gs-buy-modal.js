// gs-buy-modal — shared "Buy this game" / "Send access code" modal.
//
// Flow (unified for /game/run/ landing card and /gifts/ shop):
//   1. intro   — confirms the game + price, "Continue to payment" CTA
//   2. checkout— Stripe Embedded Checkout
//   3. success — shows the issued TGB-XXXX-XXXX access code with two actions:
//                  [ Play now ]      → calls gs-redeem-code, marks
//                                       this device as unlocked, closes;
//                                       outside an engine, routes to the
//                                       game with the code ready to apply
//                  [ Send to someone ] → reveals recipient form,
//                                         posts to gs-send-code,
//                                         emails the access code via Resend.
//
// Public API:
//   window.TgbGift.openForGame({ id, name, price, engine?, accessCode?, autoRedeem? })
//   window.TgbGift.setGameContext({ id, name, price })   (back-compat)
//   window.TgbGift.open()  /  window.TgbGift.close()
//
// On page load, if URL has ?gift_session=cs_..., we auto-open the
// success step and poll gs-lookup-code until the webhook fires
// (handles the post-Stripe-redirect return URL).
(function (global) {
  'use strict';

  if (global.TgbGift) return;

  var STRIPE_PUBLISHABLE_KEY = 'pk_test_51MF10bBFJf3v75ByzCOFJB7TL7MxnJ8I2ATlm3zszzjek7ki62BrhJ5TI0ZzTLBMk8ixoNUdsoG9pOjM8S1zR8wv00zYSpHYvw';
  var SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var EDGE_BASE = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
  var CREATE_URL = EDGE_BASE + '/gs-create-checkout';
  var LOOKUP_URL = EDGE_BASE + '/gs-lookup-code';
  var REDEEM_URL = EDGE_BASE + '/gs-redeem-code';
  var SEND_URL   = EDGE_BASE + '/gs-send-code';
  var SWAP_URL   = EDGE_BASE + '/gs-swap-game';

  // Themed to match /gifts/ (Big Shoulders Display headlines, JetBrains
  // Mono body, dark glass background, accent-colored CTAs, 10/6px radii).
  // Engines that load this modal can override --gs-accent on the modal
  // root to retint primary actions without rewriting the CSS.
  var GS_FONT_DISPLAY = '"Big Shoulders Display","Impact","Arial Narrow",sans-serif';
  var GS_FONT_BODY = '"JetBrains Mono","Menlo","Consolas",monospace';
  var GS_FONT_MONO = '"IBM Plex Mono",Menlo,Consolas,monospace';
  var STYLE = [
    // Modal root: dark glass with the gift-shop palette baked in.
    '.tgb-gift-modal{display:none;position:fixed;inset:0;z-index:1200;background:rgba(2,4,8,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:' + GS_FONT_BODY + ';--gs-accent:var(--accent,#d4a574);--gs-accent-ink:#0b0f17;--gs-ink:#f3eedc;--gs-muted:rgba(243,238,220,0.62);--gs-line:rgba(243,238,220,0.14);--gs-surface:rgba(16,21,30,0.96);--gs-input-bg:rgba(255,255,255,0.04);}',
    '.tgb-gift-modal.is-open{display:flex;}',
    // Panel: rounded dark card centered on the backdrop.
    '.tgb-gift-bar{display:flex;align-items:center;justify-content:space-between;width:min(560px,100%);padding:14px 18px;background:var(--gs-surface);border:1px solid var(--gs-line);border-bottom:0;border-radius:10px 10px 0 0;font-family:' + GS_FONT_DISPLAY + ';}',
    '.tgb-gift-title{margin:0;font-family:' + GS_FONT_DISPLAY + ';font-weight:800;font-size:1.25rem;letter-spacing:0;text-transform:uppercase;color:var(--gs-ink);}',
    '.tgb-gift-close{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--gs-line);border-radius:6px;background:transparent;color:var(--gs-muted);font-size:1.1rem;line-height:1;cursor:pointer;transition:background 0.15s,color 0.15s,border-color 0.15s;font:inherit;}',
    '.tgb-gift-close:hover{background:rgba(255,255,255,0.06);color:var(--gs-ink);border-color:var(--gs-ink);}',
    '.tgb-gift-body{flex:0 1 auto;width:min(560px,100%);max-height:80vh;overflow-y:auto;padding:20px 22px max(env(safe-area-inset-bottom),22px);background:var(--gs-surface);border:1px solid var(--gs-line);border-top:0;border-radius:0 0 10px 10px;color:var(--gs-ink);font-family:' + GS_FONT_BODY + ';font-size:0.92rem;line-height:1.55;box-shadow:0 28px 64px rgba(0,0,0,0.6);}',
    '.tgb-gift-step{display:none;}',
    '.tgb-gift-step.is-active{display:block;}',
    // Headline + body copy.
    '.tgb-gift-headline{margin:0 0 0.5rem;font-family:' + GS_FONT_DISPLAY + ';font-size:2rem;font-weight:800;line-height:1.02;letter-spacing:0;text-transform:uppercase;color:var(--gs-ink);}',
    '.tgb-gift-sub{margin:0 0 1.2rem;color:var(--gs-muted);font-size:0.86rem;line-height:1.55;}',
    '.tgb-gift-price{margin:0.25rem 0 1rem;font-family:' + GS_FONT_DISPLAY + ';font-size:2.4rem;font-weight:800;line-height:1;letter-spacing:0;color:var(--gs-accent);}',
    // CTAs: primary uses accent fill (matches .game-card-play), secondary is outlined.
    '.tgb-gift-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:44px;padding:12px 18px;border:1px solid var(--gs-accent);border-radius:6px;background:var(--gs-accent);color:var(--gs-accent-ink);font-family:' + GS_FONT_BODY + ';font-size:0.82rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,0.32) inset;transition:box-shadow 200ms ease,transform 200ms ease;font:inherit;font-size:0.82rem;font-weight:800;}',
    '.tgb-gift-cta:hover:not(:disabled),.tgb-gift-cta:focus-visible:not(:disabled){box-shadow:0 1px 0 rgba(255,255,255,0.32) inset,0 10px 24px rgba(0,0,0,0.45),0 0 22px color-mix(in srgb,var(--gs-accent) 55%,transparent);transform:translateY(-1px);outline:none;}',
    '.tgb-gift-cta:disabled{opacity:0.55;cursor:progress;}',
    '.tgb-gift-cta--secondary{background:transparent;color:var(--gs-ink);border:1px solid var(--gs-line);box-shadow:none;}',
    '.tgb-gift-cta--secondary:hover:not(:disabled){background:rgba(255,255,255,0.06);border-color:var(--gs-accent);color:var(--gs-accent);box-shadow:none;transform:translateY(-1px);}',
    '.tgb-gift-actions{display:grid;gap:0.55rem;margin-top:1rem;}',
    '.tgb-gift-error{margin:0;color:#ff7560;font-size:0.84rem;font-weight:700;min-height:1.2em;}',
    '.tgb-gift-checkout{min-height:380px;border:1px solid var(--gs-line);border-radius:6px;background:#fff;overflow:hidden;}',
    // Access-code reveal row: dashed accent border, mono digits.
    '.tgb-gift-code-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin:0.5rem 0 1.25rem;padding:14px 16px;border:2px dashed var(--gs-accent);border-radius:6px;background:rgba(212,165,116,0.06);font-family:' + GS_FONT_MONO + ';font-size:1.25rem;font-weight:700;letter-spacing:0.06em;color:var(--gs-ink);}',
    '.tgb-gift-copy{padding:8px 12px;border:1px solid var(--gs-line);border-radius:6px;background:transparent;color:var(--gs-muted);font:inherit;font-family:' + GS_FONT_BODY + ';font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:background 0.15s,color 0.15s,border-color 0.15s;}',
    '.tgb-gift-copy:hover{background:var(--gs-accent);color:var(--gs-accent-ink);border-color:var(--gs-accent);}',
    '.tgb-gift-help{margin:0.5rem 0 0;color:var(--gs-muted);font-size:0.82rem;line-height:1.55;}',
    // Send-to-someone form.
    '.tgb-gift-send-form{display:none;margin-top:1.25rem;padding:14px;border:1px solid var(--gs-line);border-radius:6px;background:var(--gs-input-bg);}',
    '.tgb-gift-send-form.is-open{display:block;}',
    '.tgb-gift-send-form-title{margin:0 0 0.85rem;font-family:' + GS_FONT_DISPLAY + ';font-size:1.05rem;font-weight:800;color:var(--gs-ink);letter-spacing:0;text-transform:uppercase;}',
    '.tgb-gift-field{display:grid;gap:0.3rem;margin-bottom:0.7rem;}',
    '.tgb-gift-field label{font-family:' + GS_FONT_BODY + ';font-size:0.66rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--gs-muted);}',
    '.tgb-gift-field input,.tgb-gift-field textarea{width:100%;padding:10px 12px;border:1px solid var(--gs-line);border-radius:6px;background:var(--gs-input-bg);color:var(--gs-ink);font:inherit;font-family:' + GS_FONT_BODY + ';font-size:0.92rem;}',
    '.tgb-gift-field textarea{min-height:64px;resize:vertical;}',
    '.tgb-gift-field input:focus,.tgb-gift-field textarea:focus{outline:none;border-color:var(--gs-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--gs-accent) 30%,transparent);}',
    '.tgb-gift-sent{margin:0;padding:12px 14px;border-radius:6px;background:rgba(102,208,136,0.12);border:1px solid rgba(102,208,136,0.4);color:#a8e8b8;font-weight:600;}',
    // "Have an access code?" toggle.
    '.tgb-gift-have-code{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--gs-line);}',
    '.tgb-gift-have-code-toggle{background:transparent;border:0;padding:0;color:var(--gs-accent);font-family:' + GS_FONT_BODY + ';font-size:0.76rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;text-decoration:underline;}',
    '.tgb-gift-have-code-toggle:hover{color:var(--gs-ink);}',
    '.tgb-gift-have-code-form{display:none;margin-top:0.8rem;}',
    '.tgb-gift-have-code-form.is-open{display:block;}',
    '.tgb-gift-have-code-row{display:flex;gap:0.5rem;}',
    '.tgb-gift-have-code-input{flex:1 1 auto;min-width:0;padding:10px 12px;border:1px solid var(--gs-line);border-radius:6px;background:var(--gs-input-bg);color:var(--gs-ink);font:inherit;font-family:' + GS_FONT_MONO + ';font-size:1rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;}',
    '.tgb-gift-have-code-input:focus{outline:none;border-color:var(--gs-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--gs-accent) 30%,transparent);}',
    '.tgb-gift-have-code-input--error{border-color:#ff7560;animation:tgbGiftShake 0.4s ease;}',
    '@keyframes tgbGiftShake{0%,100%{transform:translateX(0);}25%{transform:translateX(-5px);}75%{transform:translateX(5px);}}',
    '.tgb-gift-have-code-apply{flex:0 0 auto;padding:0 14px;border:1px solid var(--gs-accent);border-radius:6px;background:transparent;color:var(--gs-accent);font:inherit;font-family:' + GS_FONT_BODY + ';font-size:0.74rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;transition:background 0.15s,color 0.15s;}',
    '.tgb-gift-have-code-apply:hover:not(:disabled){background:var(--gs-accent);color:var(--gs-accent-ink);}',
    '.tgb-gift-have-code-apply:disabled,.tgb-gift-have-code-input:disabled{opacity:0.5;cursor:progress;}',
    // Choose-a-game list.
    '.tgb-gift-choose-list{display:grid;gap:0.5rem;margin-top:0.5rem;}',
    '.tgb-gift-choose-item{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:12px 14px;border:1px solid var(--gs-line);border-radius:6px;background:var(--gs-input-bg);cursor:pointer;font:inherit;text-align:left;transition:border-color 0.15s,transform 0.15s,background 0.15s,box-shadow 0.15s;}',
    '.tgb-gift-choose-item:hover{border-color:var(--gs-accent);background:rgba(255,255,255,0.06);transform:translateY(-1px);box-shadow:0 10px 24px rgba(0,0,0,0.35);}',
    '.tgb-gift-choose-item:active{transform:translateY(0);}',
    '.tgb-gift-choose-name{font-family:' + GS_FONT_DISPLAY + ';font-weight:800;font-size:1.1rem;color:var(--gs-ink);letter-spacing:0;text-transform:uppercase;line-height:1.05;}',
    '.tgb-gift-choose-price{font-family:' + GS_FONT_MONO + ';font-size:0.86rem;font-weight:700;color:var(--gs-muted);flex-shrink:0;}',
    '.tgb-gift-choose-empty{padding:1.5rem;text-align:center;color:var(--gs-muted);font-size:0.86rem;border:1px dashed var(--gs-line);border-radius:6px;}',
    '.tgb-gift-swap-link{display:block;margin:1.25rem auto 0;padding:0;border:0;background:transparent;color:var(--gs-accent);font:inherit;font-family:' + GS_FONT_BODY + ';font-size:0.76rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:underline;cursor:pointer;text-align:center;}',
    '.tgb-gift-swap-link:hover{color:var(--gs-ink);}',
    '.tgb-gift-swap-code{margin:0 0 0.75rem;font-family:' + GS_FONT_MONO + ';font-size:1.05rem;font-weight:700;color:var(--gs-ink);letter-spacing:0.06em;}'
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
    '    <p class="tgb-gift-sub">Pick which game you’d like to buy. After payment you can play it yourself or send the access code to someone.</p>',
    '    <div class="tgb-gift-choose-list" id="tgbGiftChooseList"></div>',
    '  </div>',

    // ── Step S: swap (entered via /?swap=CODE or the success link) ───
    '  <div class="tgb-gift-step" id="tgbGiftStepSwap">',
    '    <h3 class="tgb-gift-headline">Swap to a different game</h3>',
    '    <p class="tgb-gift-sub">Pick the game you want instead. Your access code stays the same and now unlocks the new game.</p>',
    '    <p class="tgb-gift-swap-code" id="tgbGiftSwapCodeLabel"></p>',
    '    <p class="tgb-gift-error" id="tgbGiftSwapError" aria-live="polite"></p>',
    '    <div class="tgb-gift-choose-list" id="tgbGiftSwapList"></div>',
    '  </div>',

    // ── Step 1: intro ────────────────────────────────────────────────
    '  <div class="tgb-gift-step is-active" id="tgbGiftStepIntro">',
    '    <h3 class="tgb-gift-headline" id="tgbGiftIntroHeadline">Buy this game</h3>',
    '    <p class="tgb-gift-price" id="tgbGiftIntroPrice" hidden>&mdash;</p>',
    '    <p class="tgb-gift-sub" id="tgbGiftIntroSub">After payment you’ll get an access code. Play it yourself, or send it to someone as a gift.</p>',
    '    <form class="tgb-gift-form" id="tgbGiftIntroForm" autocomplete="on">',
    '      <div class="tgb-gift-field">',
    '        <label for="tgbGiftBuyerEmail">Your email (for the receipt)</label>',
    '        <input id="tgbGiftBuyerEmail" name="buyer_email" type="email" required autocomplete="email">',
    '      </div>',
    '    </form>',
    '    <p class="tgb-gift-error" id="tgbGiftIntroError" aria-live="polite"></p>',
    '    <button type="button" class="tgb-gift-cta" id="tgbGiftContinueBtn">Continue to payment</button>',
    '    <div class="tgb-gift-have-code">',
    '      <button type="button" class="tgb-gift-have-code-toggle" id="tgbGiftHaveCodeToggle" aria-expanded="false">Have an access code?</button>',
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
    '    <p class="tgb-gift-sub">Pay securely via Stripe to issue the access code.</p>',
    '    <div class="tgb-gift-checkout" id="tgbGiftCheckoutMount"></div>',
    '  </div>',

    // ── Step 3: success + actions ────────────────────────────────────
    '  <div class="tgb-gift-step" id="tgbGiftStepSuccess">',
    '    <h3 class="tgb-gift-headline" id="tgbGiftSuccessHeadline">Payment confirmed</h3>',
    '    <p class="tgb-gift-sub" id="tgbGiftSuccessSub">Here’s your access code.</p>',
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
    '      <p class="tgb-gift-send-form-title">Send the access code by email</p>',
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
    '        <button type="submit" class="tgb-gift-cta" id="tgbGiftSendSubmitBtn">Send access code</button>',
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
    sessionId: '',     // set when gs-create-checkout returns, or pulled from ?gift_session=
    code: '',          // set when checkout or lookup produces an access code
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
      sub.textContent = 'After payment you’ll get an access code. Play it yourself, or send it to someone as a gift.';
    }
  }

  function normalizeEngine(value) {
    var s = String(value || '').trim().toLowerCase();
    if (s === '2') return 'map';
    if (s === 'map') return 'map';
    return 'text';
  }

  function isEnginePage() {
    return /\/game\/run\/(?:text|map)\//.test(global.location.pathname);
  }

  function normalizeAccessCode(value) {
    var raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw.startsWith('TGB')) return '';
    var rest = raw.slice(3);
    if (rest.length !== 8) return '';
    return 'TGB-' + rest.slice(0, 4) + '-' + rest.slice(4, 8);
  }

  function buildPlayUrl(game, code) {
    var selected = game || {};
    var params = new URLSearchParams(global.location.search || '');
    var engine = normalizeEngine(params.get('e') || selected.engine);
    var url = new URL('/game/run/' + engine + '/', global.location.origin);
    url.searchParams.set('id', selected.id || '');
    var normalized = normalizeAccessCode(code);
    if (normalized) {
      url.searchParams.set('access_code', normalized);
      url.searchParams.set('auto_redeem', '1');
    }
    return url.toString();
  }

  function saveLocalAccessUnlock(gameId, code) {
    if (!gameId || !code) return;
    try {
      var key = 'tgb_' + gameId + '_checkout_unlocks';
      var existing = {};
      try { existing = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
      existing['access:' + code] = {
        unlockedAt: new Date().toISOString(),
        accessCode: code,
        sourceUrl: '',
        orderId: code
      };
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (_) {}
  }

  function primeAccessCode(code, autoRedeem) {
    var normalized = normalizeAccessCode(code);
    if (!normalized) return;
    var toggle = $('tgbGiftHaveCodeToggle');
    var form = $('tgbGiftHaveCodeForm');
    var input = $('tgbGiftHaveCodeInput');
    if (form) form.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (input) input.value = normalized;
    if (autoRedeem) {
      setTimeout(function () { handleHaveCodeApply(); }, 120);
    }
  }

  function openForGame(game) {
    var accessCode = game && (game.accessCode || game.code);
    var autoRedeem = !!(game && game.autoRedeem);
    applyGameContext(game);
    state.sessionId = '';
    state.code = '';
    state.redeemed = false;
    open('tgbGiftStepIntro');
    if (accessCode) primeAccessCode(accessCode, autoRedeem);
  }

  // Open the modal at the chooser step, where the buyer picks a game
  // from a list. Used by the "Game Access — Your Pick" tile in /gifts/.
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
          price: game.price || '',
          engine: game.engine || ''
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
    if (label) label.textContent = code ? 'Access code: ' + code : '';
    setError('tgbGiftSwapError', '');
    open('tgbGiftStepSwap');
    var games = (opts && Array.isArray(opts.games)) ? opts.games : null;
    if (!games) games = await fetchPaidGamesFallback();
    renderSwapList(games);
  }

  async function fetchPaidGamesFallback() {
    try {
      var url = SUPABASE_URL + '/rest/v1/games?select=id,name,price,engine,archived&apikey=sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
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
      setError('tgbGiftSwapError', 'Missing access code.');
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
        price: data.price || game.price || '',
        engine: data.engine || game.engine || ''
      });
      var codeEl = $('tgbGiftSuccessCode');
      if (codeEl) codeEl.textContent = state.code;
      var subEl = $('tgbGiftSuccessSub');
      if (subEl) subEl.textContent = 'Swapped to "' + (data.game_name || game.name) + '". Your access code now unlocks this game.';
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
      // Access code is issued at session-create time now (not at webhook time),
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
      // transition to the success step. The access code was already issued by
      // gs-create-checkout (state.code), so we show it instantly —
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
    if (codeEl) codeEl.textContent = 'Generating access code...';
    if (subEl)  subEl.textContent  = 'Confirming your payment...';
    for (var attempt = 0; attempt < 12; attempt++) {
      try {
        var row = await lookupSession(sessionId);
        if (row && row.code) {
          state.code = row.code;
          if (codeEl) codeEl.textContent = row.code;
          if (subEl)  subEl.textContent  = 'Here’s your access code.';
          return;
        }
      } catch (_) { /* keep polling */ }
      await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }
    if (codeEl) codeEl.textContent = '—';
    if (subEl)  subEl.textContent  = 'Payment confirmed but the access code is still being generated. Refresh in a moment.';
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
      setError('tgbGiftSuccessError', 'Access code not ready yet — try again in a moment.');
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

    if (!isEnginePage()) {
      global.location.href = buildPlayUrl(state.game, state.code);
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
      saveLocalAccessUnlock(state.game.id, state.code);
      emit('tgb-gift-redeemed', { game_id: state.game.id, code: state.code, source: 'play_now' });
      close();
    } catch (error) {
      console.error(error);
      setError('tgbGiftSuccessError', error.message || 'Could not unlock.');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // ── Action: Play later (just close; buyer keeps the access code) ────
  function handlePlayLater() {
    setError('tgbGiftSuccessError', '');
    // Don't auto-redeem — the buyer wants to use the access code later
    // (probably on another device, or when they're ready to play).
    // The buyer-receipt email from the webhook gives them a copy.
    close();
  }

  // ── Action: Send to someone (reveal form, post gs-send-code) ──────
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
        sent.textContent = 'Access code emailed to ' + recipient + '.';
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

  // ── Action: Have an access code? (skip Stripe, redeem directly) ─────
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
      setError('tgbGiftHaveCodeError', 'Access codes look like TGB-XXXX-XXXX.');
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
    var normalized = normalizeAccessCode(raw) || raw;
    applyBtn.disabled = true;
    input.disabled = true;
    var originalLabel = applyBtn.textContent;
    applyBtn.textContent = 'Checking...';
    try {
      var result = await attemptRedeem(normalized, state.game.id);
      if (!result.ok) {
        var reason = String(result.reason || 'not valid').replace(/_/g, ' ');
        setError('tgbGiftHaveCodeError', 'Access code could not be redeemed (' + reason + ').');
        input.classList.add('tgb-gift-have-code-input--error');
        setTimeout(function () { input.classList.remove('tgb-gift-have-code-input--error'); }, 700);
        return;
      }
      // Save the unlock to localStorage so the engine doesn't re-prompt.
      saveLocalAccessUnlock(state.game.id, normalized);
      state.code = normalized;
      state.redeemed = true;
      emit('tgb-gift-redeemed', { game_id: state.game.id, code: normalized, source: 'have_code' });
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
