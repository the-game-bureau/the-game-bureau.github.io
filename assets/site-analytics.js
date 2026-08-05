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
  if (/^\/(mc|account)\//.test(path) || /\/admin\//.test(path)
    || /^\/gifts\/giftcards/.test(path)) return;

  var beacon = document.createElement('script');
  // type="module" matches the snippet Cloudflare hands out, and beacon.min.js is
  // shipped as an ES module — loading it as a classic script risks failing on its
  // own syntax. Modules defer by default, so no defer attribute is needed.
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN }));
  (document.head || document.documentElement).appendChild(beacon);
}());
