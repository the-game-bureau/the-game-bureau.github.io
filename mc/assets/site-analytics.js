// site-analytics.js — visitor counts for the public pages.
//
// Cloudflare Web Analytics. Picked over Plausible and GA4 for three reasons that
// matter for this site: it is free at any traffic level, it sets no cookies and
// stores no per-visitor identifier (so no consent banner and nothing to write a
// privacy policy about), and it is a single beacon that works on plain GitHub
// Pages with no build step and no proxying of the domain.
//
// What it answers: how many people opened a page, where they came from, roughly
// where they are, and which pages they landed on. What it cannot answer: which
// cassette anyone actually played. Play counts would need our own event table —
// deliberately not built here.
//
// SETUP — one value, then this file works everywhere it is included:
//   1. dash.cloudflare.com → Analytics & Logs → Web Analytics → Add a site
//   2. Enter thegamebureau.com. Cloudflare shows a snippet containing
//      data-cf-beacon='{"token":"abc123..."}'
//   3. Paste that token between the quotes below. Nothing else needs editing.
//
// Until the token is filled in this file loads and does nothing, so shipping it
// early is harmless.

(function () {
  'use strict';

  var TOKEN = '6459c272d55e420ab9ddbf7ea5e68a08';

  if (!TOKEN) return;

  // Local and preview traffic is us, not visitors. Counting it makes the numbers
  // lie in the direction most likely to be believed.
  var host = String(window.location.hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    || /\.local$/.test(host) || /^192\.168\./.test(host)) return;

  // Never count the internal pages. They are the admin surfaces — Mission
  // Control, the Tape Room, the Stock Room, the socials admin — and our own
  // sessions in them would swamp real visitor numbers on a site this size.
  var path = String(window.location.pathname || '').toLowerCase();

  // /mc/ IS NOT A SYNONYM FOR ADMIN ANY MORE. The 2026-08-06 consolidation moved
  // four genuinely public pages under it — How It Works, the sampler, the survey
  // and the account page — all of which still wear public chrome and are still
  // linked from the public nav. A blanket /mc/ block silently refused to count
  // them, so adding the beacon to those pages was a no-op that looked like it
  // had worked. They are allowed back by name; anything else under /mc/ stays
  // out, which is the safe direction for a list that has to be maintained by
  // hand — a new admin room is excluded by default, a new public page under
  // /mc/ merely goes uncounted until someone adds it here.
  var PUBLIC_MC = /^\/mc\/(how|sampler|survey|account)(\/|$)/;

  // No single-page exemptions at present. There was one for a few hours on
  // 2026-08-07 — /mc/gifts/aboutshop.html, a public page stranded inside the
  // gift shop admin folder — and it went away when that page moved to
  // /shell/aboutshop.html, outside /mc/ entirely. Keep the mechanism: it is the
  // only way to expose one public page from an otherwise-internal folder, and a
  // folder rule there would have leaked the Stock Room into visitor numbers.
  var PUBLIC_MC_PAGES = /$^/;

  // `account` is matched bare as well, as a tripwire for an old bookmark: the
  // account page moved to /mc/account/ on 2026-08-06 and a bare /account/ path
  // should no longer resolve at all.
  if (!PUBLIC_MC.test(path) && !PUBLIC_MC_PAGES.test(path)) {
    if (/^\/(mc|account)\//.test(path)) return;
  }
  // THE MINIGAMES LEFT /mc/ ON 2026-09-04 and had to be named here, because
  // the rule above is an allowlist UNDER /mc/ and everything else there was
  // refused by default. They are part of the PAID RUNTIME -- both engines load
  // them mid-game -- so a play is already recorded in `game_instances` at far
  // better fidelity than a page view, and counting them would inflate visitor
  // numbers with people who have already bought.
  //   NOTHING CHANGES TODAY: no minigame carries the beacon. This is the
  // decision surviving the move rather than a fix.
  if (/^\/minigames(\/|$)/.test(path)) return;

  // Admin lives under an /admin/ segment wherever it sits. The gift shop's
  // admin, its Operations page and its access-code page carry no such segment;
  // all three now sit under /mc/ and are caught by the rule above.
  if (/\/admin\//.test(path)) return;

  var beacon = document.createElement('script');
  // type="module" matches the snippet Cloudflare hands out, and beacon.min.js is
  // shipped as an ES module — loading it as a classic script risks failing on its
  // own syntax. Modules defer by default, so no defer attribute is needed.
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN }));
  (document.head || document.documentElement).appendChild(beacon);
}());
