/* Rewrites asset URLs that were stored in the database under an older layout so
   they still resolve today. Load it before anything that renders a stored image:

     <script src="/mc/assets/legacy-asset-url.js"></script>

   Then run every stored image URL through window.tgbLegacyAssetUrl().

   WHY THIS EXISTS. `assets/` moved to `mc/assets/` on 2026-08-06, but hundreds
   of rows in public.games hold the old absolute URL and there is no service-role
   key on hand to run the UPDATE that would fix them. Rewriting at read time costs
   one function call and needs no database write, so the move did not have to wait
   on a credential — and it keeps working if a row is written with the old shape
   again by an older tool.

   TWO LEGACY SHAPES, both seen in the live table:

     https://thegamebureau.com/assets/guides/<id>.png        games.guide_image_url
     https://thegamebureau.com/site/assets/games/<file>      games.logo_url

   The second predates this move: `site/` disappeared when the repo was flattened
   out of its old layout, so all 268 of those rows have been 404ing since then.
   Both now land on /mc/assets/.

   WHAT IT DELIBERATELY DOES NOT TOUCH. Supabase Storage URLs, and any other host,
   pass through unchanged — a guide image uploaded through the editor is stored as
   a Storage URL and must not be rewritten. The match is anchored to our own
   origin, or to a root-relative path, for exactly that reason.

   This is a compatibility shim, not the destination. Once a service-role key is
   available, `update public.games set guide_image_url = replace(guide_image_url,
   '/assets/', '/mc/assets/')` (and the equivalent for logo_url, dropping the
   `/site` segment) makes it dead code. Leaving it in place after that is still
   harmless: it only ever fires on a shape that no longer exists. */
(function (global) {
  'use strict';

  var OUR_HOST = /^https?:\/\/(?:www\.)?thegamebureau\.com/i;

  // Ordered: the /site/ form has to be tried first, since it also contains
  // "/assets/" and the plainer rule would leave the dead /site segment behind.
  var RULES = [
    [/^\/site\/assets\//i, '/mc/assets/'],
    [/^\/assets\//i, '/mc/assets/']
  ];

  function tgbLegacyAssetUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';

    // Only our own origin, or a root-relative path, is ever rewritten.
    var path = raw;
    var prefix = '';
    if (OUR_HOST.test(raw)) {
      prefix = raw.replace(/^(https?:\/\/[^/]+).*$/, '$1');
      path = raw.slice(prefix.length) || '/';
    } else if (raw.charAt(0) !== '/') {
      return raw;                       // another host, a data: URI, or relative
    }

    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(path)) {
        return prefix + path.replace(RULES[i][0], RULES[i][1]);
      }
    }
    return raw;
  }

  global.tgbLegacyAssetUrl = tgbLegacyAssetUrl;
}(typeof window !== 'undefined' ? window : this));
