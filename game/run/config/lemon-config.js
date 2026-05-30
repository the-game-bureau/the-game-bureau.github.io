// Legacy LemonSqueezy config retained only so older local/dev pages that
// reference window.TGB_LEMON_CONFIG do not throw. Live purchases use the
// Stripe access-code modal in /gifts/gs-buy-modal.js.
window.TGB_LEMON_CONFIG = {
  provider: 'legacy-lemon',
  enabled: false,
  storeSlug: '',
  variantId: '',
  checkoutUrl: ''
};
